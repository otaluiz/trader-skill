#!/usr/bin/env python3
"""Auto-Trading Worker & Risk Guard.
Runs automated trading within strictly defined balance limits when enabled.
"""

import datetime
import os
import time
from typing import Dict, List, Optional
from backend.trade_manager import TradeManager
from trader_engine.strategy import StrategyEngine
from trader_binance.connector import BinanceConnector, POPULAR_CRYPTO_SYMBOLS
from trader_b3.market import B3Market
from trader_us.market import USMarket


class AutoTrader:
    def __init__(self, trade_mgr: TradeManager, strategy_engine: StrategyEngine):
        self.trade_mgr = trade_mgr
        self.strategy_engine = strategy_engine
        self.b3_market = B3Market()
        self.us_market = USMarket()
        self.last_run_time = 0
        self.log_messages = []

    def log(self, msg: str):
        entry = f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {msg}"
        self.log_messages.append(entry)
        if len(self.log_messages) > 100:
            self.log_messages.pop(0)

    def get_status(self) -> Dict:
        cfg = self.trade_mgr.load_config()
        enabled = bool(cfg.get("auto_trading_enabled", False))
        max_spend = float(cfg.get("auto_trading_max_spend_usd", 50.0))
        spent = float(cfg.get("auto_trading_current_spent_usd", 0.0))
        remaining = max(0.0, max_spend - spent)
        order_size = float(cfg.get("auto_trading_order_size_usd", 10.0))
        min_conf = int(cfg.get("auto_trading_min_confidence", 80))

        return {
            "enabled": enabled,
            "max_spend_usd": max_spend,
            "current_spent_usd": spent,
            "remaining_spend_usd": remaining,
            "order_size_usd": order_size,
            "min_confidence": min_conf,
            "quota_exhausted": spent >= max_spend,
            "recent_logs": self.log_messages[-10:]
        }

    def reset_spend(self) -> Dict:
        cfg = self.trade_mgr.load_config()
        cfg["auto_trading_current_spent_usd"] = 0.0
        self.trade_mgr.save_config(cfg)
        self.log("Quota de saldo do modo automático foi reiniciada pelo usuário.")
        return self.get_status()

    def run_cycle(self) -> Dict:
        cfg = self.trade_mgr.load_config()
        if not cfg.get("auto_trading_enabled", False):
            return {"status": "disabled", "message": "Modo automático desativado."}

        max_spend = float(cfg.get("auto_trading_max_spend_usd", 50.0))
        current_spent = float(cfg.get("auto_trading_current_spent_usd", 0.0))
        order_size = float(cfg.get("auto_trading_order_size_usd", 10.0))
        min_conf = int(cfg.get("auto_trading_min_confidence", 80))

        if current_spent >= max_spend:
            self.log(f"Limite de saldo automático atingido: ${current_spent:.2f} / ${max_spend:.2f}. Novas ordens pausadas.")
            return {
                "status": "quota_reached",
                "message": f"Limite de saldo atingido (${current_spent:.2f} de ${max_spend:.2f})."
            }

        # Check existing executed tickets today to avoid duplicate entries in same asset
        today_str = datetime.date.today().isoformat()
        recent_tickets = self.trade_mgr.load_tickets()
        traded_today = {
            t["symbol"].upper() for t in recent_tickets 
            if t.get("created_at", "").startswith(today_str) and t.get("status") in ("APPROVED", "EXECUTED", "READY")
        }

        executed_in_cycle = []
        b_conn = self.trade_mgr.get_binance_connector()

        # 1. Evaluate Binance Crypto candidates if allow_crypto is True
        if cfg.get("allow_crypto", True):
            # Whitelist filter
            whitelist_enabled = bool(cfg.get("crypto_whitelist_enabled", False))
            user_whitelist = [s.strip().upper() for s in cfg.get("crypto_whitelist", []) if s.strip()]
            
            candidates = user_whitelist if (whitelist_enabled and user_whitelist) else POPULAR_CRYPTO_SYMBOLS

            for raw_sym in candidates:
                if current_spent + order_size > max_spend:
                    break
                sym = b_conn.validate_symbol(raw_sym)
                if sym in traded_today:
                    continue

                try:
                    candles = b_conn.get_klines(sym, interval="1h", limit=50)
                    rec = self.strategy_engine.analyze_asset(sym, "Binance", candles)
                    if rec and rec["action"] == "BUY" and rec["confidence"] >= min_conf:
                        self.log(f"Sinal de compra automática detectado em {sym} (Confiança: {rec['confidence']}%)")
                        
                        # Propose
                        ticket = self.trade_mgr.propose_order(
                            symbol=sym,
                            side="BUY",
                            market="Binance",
                            notional=order_size,
                            limit_price=rec["entry_price"],
                            stop_loss=rec["stop_loss"],
                            take_profit=rec["take_profit_1"],
                            rationale=f"[AUTO-BOT] {rec['rationale']}"
                        )

                        if ticket.get("status") == "READY":
                            self.trade_mgr.approve_ticket(ticket["id"])
                            exec_res = self.trade_mgr.execute_ticket(ticket["id"])
                            current_spent += order_size
                            cfg["auto_trading_current_spent_usd"] = round(current_spent, 2)
                            self.trade_mgr.save_config(cfg)
                            traded_today.add(sym)
                            executed_in_cycle.append(ticket["id"])
                            self.log(f"Ordem automática executada com sucesso: {sym} (${order_size:.2f})")
                        else:
                            self.log(f"Ordem de {sym} bloqueada pelo risco: {ticket.get('reasons')}")
                except Exception as e:
                    self.log(f"Erro ao avaliar {sym}: {e}")

        # 2. Evaluate US Stocks candidates if enabled
        if cfg.get("us_market_enabled", True) and (current_spent + order_size <= max_spend):
            us_candidates = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN"]
            for us_sym in us_candidates:
                if current_spent + order_size > max_spend:
                    break
                if us_sym in traded_today:
                    continue
                try:
                    candles = self.us_market.get_klines(us_sym, range_period="2mo", interval="1d")
                    rec = self.strategy_engine.analyze_asset(us_sym, "US", candles)
                    if rec and rec["action"] == "BUY" and rec["confidence"] >= min_conf:
                        self.log(f"Sinal de compra automática detectado em {us_sym} (Confiança: {rec['confidence']}%)")
                        ticket = self.trade_mgr.propose_order(
                            symbol=us_sym,
                            side="BUY",
                            market="US",
                            notional=order_size,
                            limit_price=rec["entry_price"],
                            stop_loss=rec["stop_loss"],
                            take_profit=rec["take_profit_1"],
                            rationale=f"[AUTO-BOT] {rec['rationale']}"
                        )
                        if ticket.get("status") == "READY":
                            self.trade_mgr.approve_ticket(ticket["id"])
                            self.trade_mgr.execute_ticket(ticket["id"])
                            current_spent += order_size
                            cfg["auto_trading_current_spent_usd"] = round(current_spent, 2)
                            self.trade_mgr.save_config(cfg)
                            traded_today.add(us_sym)
                            executed_in_cycle.append(ticket["id"])
                            self.log(f"Ordem US executada com sucesso: {us_sym} (${order_size:.2f})")
                except Exception as e:
                    self.log(f"Erro ao avaliar {us_sym}: {e}")

        # 3. Evaluate B3 Stocks candidates if enabled
        if cfg.get("b3_market_enabled", True) and (current_spent + order_size <= max_spend):
            b3_candidates = ["PETR4", "VALE3", "ITUB4", "WEGE3"]
            for b3_sym in b3_candidates:
                if current_spent + order_size > max_spend:
                    break
                if b3_sym in traded_today:
                    continue
                try:
                    candles = self.b3_market.get_klines(b3_sym, range_period="2mo", interval="1d")
                    rec = self.strategy_engine.analyze_asset(b3_sym, "B3", candles)
                    if rec and rec["action"] == "BUY" and rec["confidence"] >= min_conf:
                        self.log(f"Sinal B3 detectado em {b3_sym} (Confiança: {rec['confidence']}%)")
                        ticket = self.trade_mgr.propose_order(
                            symbol=b3_sym,
                            side="BUY",
                            market="B3",
                            notional=order_size * 5.0, # convert USD order size to BRL approx
                            limit_price=rec["entry_price"],
                            stop_loss=rec["stop_loss"],
                            take_profit=rec["take_profit_1"],
                            rationale=f"[AUTO-BOT] {rec['rationale']}"
                        )
                        if ticket.get("status") == "READY":
                            self.trade_mgr.approve_ticket(ticket["id"])
                            self.trade_mgr.execute_ticket(ticket["id"])
                            current_spent += order_size
                            cfg["auto_trading_current_spent_usd"] = round(current_spent, 2)
                            self.trade_mgr.save_config(cfg)
                            traded_today.add(b3_sym)
                            executed_in_cycle.append(ticket["id"])
                            self.log(f"Ordem B3 executada com sucesso: {b3_sym}")
                except Exception as e:
                    self.log(f"Erro ao avaliar {b3_sym}: {e}")

        self.last_run_time = int(time.time())
        return {
            "status": "completed",
            "executed_count": len(executed_in_cycle),
            "executed_tickets": executed_in_cycle,
            "current_spent_usd": current_spent,
            "remaining_spend_usd": max(0.0, max_spend - current_spent)
        }
