#!/usr/bin/env python3
"""MetaTrader 5 (MT5) Connector for Brazilian Stock Market (B3).
Routes orders through local MetaTrader 5 desktop client (Clear, XP, BTG, Genial, etc.)
Falls back to realistic B3 paper trading simulation if MT5 is not active.
"""

import json
import os
import time
from typing import Dict, List, Optional

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False


class B3MT5Connector:
    def __init__(self, account: int = None, password: str = None, server: str = None):
        self.account = account
        self.password = password
        self.server = server
        self.paper_state_file = os.path.join("trader", "state", "b3_paper_wallet.json")
        self._init_paper_wallet()
        self._connected = False
        self._check_connection()

    def _init_paper_wallet(self):
        if not os.path.exists(self.paper_state_file):
            os.makedirs(os.path.dirname(self.paper_state_file), exist_ok=True)
            with open(self.paper_state_file, "w", encoding="utf-8") as f:
                json.dump({"cash_brl": 5000.0, "positions": {}}, f, indent=2)

    def _check_connection(self) -> bool:
        if not MT5_AVAILABLE:
            self._connected = False
            return False

        try:
            init_res = mt5.initialize()
            if init_res:
                self._connected = True
                return True
            else:
                self._connected = False
                return False
        except Exception:
            self._connected = False
            return False

    def is_connected(self) -> bool:
        return self._connected

    def get_status(self) -> Dict:
        """Checks connection status with MT5 terminal."""
        is_conn = self._check_connection()
        if is_conn:
            term_info = mt5.terminal_info()._asdict() if mt5.terminal_info() else {}
            acct_info = mt5.account_info()._asdict() if mt5.account_info() else {}
            return {
                "mode": "mt5_live",
                "connected": True,
                "broker": term_info.get("company", "Corretora B3 Conectada"),
                "account": acct_info.get("login"),
                "balance_brl": acct_info.get("balance", 0.0),
                "equity_brl": acct_info.get("equity", 0.0),
            }
        else:
            try:
                with open(self.paper_state_file, "r", encoding="utf-8") as f:
                    wallet = json.load(f)
            except Exception:
                wallet = {"cash_brl": 5000.0, "positions": {}}
            return {
                "mode": "b3_simulation",
                "connected": False,
                "broker": "Simulação Local B3 (MT5 não detectado)",
                "balance_brl": wallet.get("cash_brl", 5000.0),
                "equity_brl": wallet.get("cash_brl", 5000.0),
            }

    def format_b3_symbol(self, raw_symbol: str, qty: int) -> str:
        """Formats ticker according to standard lot (100) or fractional lot (F)."""
        sym = raw_symbol.upper().replace(".SA", "").strip()
        if qty % 100 != 0 and not sym.endswith("F"):
            sym = f"{sym}F"
        elif qty % 100 == 0 and sym.endswith("F"):
            sym = sym[:-1]
        return sym

    def create_order(self, symbol: str, side: str, qty: int = 100,
                     limit_price: float = None, stop_loss: float = None,
                     take_profit: float = None) -> Dict:
        """Places a buy or sell order on B3 via MT5 or local simulation."""
        side = side.strip().upper()
        formatted_symbol = self.format_b3_symbol(symbol, qty)

        # 1. Real MetaTrader 5 Execution if connected
        if self._check_connection():
            mt5.symbol_select(formatted_symbol, True)
            tick = mt5.symbol_info_tick(formatted_symbol)
            if not tick:
                raise ValueError(f"Ativo {formatted_symbol} não encontrado no MetaTrader 5.")

            price = limit_price or (tick.ask if side == "BUY" else tick.bid)
            order_type = mt5.ORDER_TYPE_BUY if side == "BUY" else mt5.ORDER_TYPE_SELL

            request = {
                "action": mt5.TRADE_ACTION_DEAL,
                "symbol": formatted_symbol,
                "volume": float(qty),
                "type": order_type,
                "price": float(price),
                "sl": float(stop_loss) if stop_loss else 0.0,
                "tp": float(take_profit) if take_profit else 0.0,
                "deviation": 20,
                "magic": 234000,
                "comment": "Trader-Skill B3",
                "type_time": mt5.ORDER_TIME_GTC,
                "type_filling": mt5.ORDER_FILLING_RETURN,
            }

            result = mt5.order_send(request)
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                raise ValueError(f"MT5 rejeitou ordem ({result.retcode}): {result.comment}")

            return {
                "order_id": result.order,
                "symbol": formatted_symbol,
                "side": side,
                "qty": qty,
                "price": result.price,
                "value_brl": round(qty * result.price, 2),
                "status": "FILLED",
                "mode": "mt5_live",
                "time": int(time.time() * 1000)
            }

        # 2. Local Paper Simulation fallback
        try:
            with open(self.paper_state_file, "r", encoding="utf-8") as f:
                wallet = json.load(f)
        except Exception:
            wallet = {"cash_brl": 5000.0, "positions": {}}

        est_price = limit_price or 35.0
        total_val = round(qty * est_price, 2)

        if side == "BUY":
            if wallet.get("cash_brl", 0) < total_val:
                raise ValueError(f"Saldo insuficiente na simulação B3! Requerido: R${total_val:.2f}, Saldo: R${wallet.get('cash_brl', 0):.2f}")
            wallet["cash_brl"] = round(wallet.get("cash_brl", 0) - total_val, 2)
            cur_qty = wallet.get("positions", {}).get(formatted_symbol, 0)
            wallet.setdefault("positions", {})[formatted_symbol] = cur_qty + qty
        else: # SELL
            cur_qty = wallet.get("positions", {}).get(formatted_symbol, 0)
            if cur_qty < qty:
                raise ValueError(f"Quantidade insuficiente de {formatted_symbol} para venda na simulação! Carteira possui: {cur_qty}")
            wallet["cash_brl"] = round(wallet.get("cash_brl", 0) + total_val, 2)
            wallet.setdefault("positions", {})[formatted_symbol] = cur_qty - qty

        with open(self.paper_state_file, "w", encoding="utf-8") as f:
            json.dump(wallet, f, indent=2)

        order_id = int(time.time() * 1000)
        return {
            "order_id": f"b3_sim_{order_id}",
            "symbol": formatted_symbol,
            "side": side,
            "qty": qty,
            "price": est_price,
            "value_brl": total_val,
            "status": "FILLED",
            "mode": "b3_simulation",
            "time": int(time.time() * 1000)
        }
