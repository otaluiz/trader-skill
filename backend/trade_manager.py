#!/usr/bin/env python3
"""Trade Manager & Ticket Orchestration.
Integrates trader-risk, trader-budget, Binance API connector, Alpaca US connector, and B3 MT5 connector.
"""

import datetime
import hashlib
import json
import os
import time
from typing import Dict, List, Optional
import sys

# Ensure modules can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "trader-risk")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "trader-broker")))

from trader_binance.connector import BinanceConnector, POPULAR_CRYPTO_ASSETS, POPULAR_CRYPTO_SYMBOLS
from trader_us.alpaca_connector import AlpacaConnector
from trader_b3.mt5_connector import B3MT5Connector
from trader_b3.cloud_api_connector import B3CloudAPIConnector
import check as risk_check
import ticket as broker_ticket

CONFIG_PATH = os.path.join("trader", "config.json")
CONFIG_LOCAL_PATH = os.path.join("trader", "config.local.json")
TICKETS_STATE_PATH = os.path.join("trader", "state", "tickets.json")
PRICES_PATH = os.path.join("trader", "prices.json")
PORTFOLIO_PATH = os.path.join("trader", "portfolio.json")

DEFAULT_CONFIG = {
    "budget": 100.0,
    "cash_buffer_pct": 15,
    "max_position_pct": 30,
    "max_order_usd": 25.0,
    "min_order_usd": 5.0,
    "max_orders_per_day": 10,
    "paper": False,
    "binance_live": True,
    "binance_testnet": False,
    "binance_api_key": "",
    "binance_api_secret": "",
    "crypto_whitelist_enabled": False,
    "crypto_whitelist": ["BTC", "ETH", "AAVE", "SOL", "LINK"],
    "us_market_enabled": True,
    "us_max_order_usd": 25.0,
    "us_budget_usd": 100.0,
    "alpaca_api_key": "",
    "alpaca_api_secret": "",
    "alpaca_paper": True,
    "b3_market_enabled": True,
    "b3_connection_type": "cloud_api",
    "b3_provider": "btg_pactual",
    "b3_api_key": "",
    "b3_api_secret": "",
    "b3_account": "",
    "b3_api_token": "",
    "b3_cloud_live": False,
    "b3_cloud_endpoint": "",
    "b3_max_order_brl": 250.0,
    "b3_budget_brl": 1000.0,
    "b3_allow_fractional": True,
    "mt5_enabled": True,
    "auto_trading_enabled": False,
    "auto_trading_max_spend_usd": 50.0,
    "auto_trading_order_size_usd": 10.0,
    "auto_trading_min_confidence": 80,
    "auto_trading_current_spent_usd": 0.0,
    "blocked": [],
    "allow_crypto": True,
    "allow_b3": True,
    "allow_options": False,
    "google_auth_enabled": False,
    "google_client_id": "",
    "google_client_secret": "",
    "google_allowed_emails": [],
    "jwt_secret_key": ""
}


class TradeManager:
    def __init__(self):
        self._ensure_files()
        self.config = self.load_config()

    def _ensure_files(self):
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        os.makedirs(os.path.dirname(TICKETS_STATE_PATH), exist_ok=True)
        if not os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_CONFIG, f, indent=2)
        if not os.path.exists(TICKETS_STATE_PATH):
            with open(TICKETS_STATE_PATH, "w", encoding="utf-8") as f:
                json.dump({"tickets": []}, f, indent=2)
        if not os.path.exists(PORTFOLIO_PATH):
            with open(PORTFOLIO_PATH, "w", encoding="utf-8") as f:
                json.dump({"cash": 100.0, "positions": []}, f, indent=2)

    def load_config(self) -> Dict:
        try:
            cfg = dict(DEFAULT_CONFIG)
            if os.path.exists(CONFIG_PATH):
                with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                    cfg.update(json.load(f))
            if os.path.exists(CONFIG_LOCAL_PATH):
                try:
                    with open(CONFIG_LOCAL_PATH, "r", encoding="utf-8") as lf:
                        cfg.update(json.load(lf))
                except Exception:
                    pass
            # Environment variables override
            if os.environ.get("GOOGLE_CLIENT_ID"):
                cfg["google_client_id"] = os.environ["GOOGLE_CLIENT_ID"].strip()
            if os.environ.get("GOOGLE_CLIENT_SECRET"):
                cfg["google_client_secret"] = os.environ["GOOGLE_CLIENT_SECRET"].strip()
            if os.environ.get("GOOGLE_AUTH_ENABLED"):
                cfg["google_auth_enabled"] = os.environ["GOOGLE_AUTH_ENABLED"].strip().lower() in ("true", "1", "yes")
            if os.environ.get("GOOGLE_ALLOWED_EMAILS"):
                cfg["google_allowed_emails"] = [e.strip() for e in os.environ["GOOGLE_ALLOWED_EMAILS"].split(",") if e.strip()]
            if os.environ.get("JWT_SECRET_KEY"):
                cfg["jwt_secret_key"] = os.environ["JWT_SECRET_KEY"].strip()
            if os.environ.get("BINANCE_API_KEY"):
                cfg["binance_api_key"] = os.environ["BINANCE_API_KEY"].strip()
            if os.environ.get("BINANCE_API_SECRET"):
                cfg["binance_api_secret"] = os.environ["BINANCE_API_SECRET"].strip()
            if os.environ.get("ALPACA_API_KEY"):
                cfg["alpaca_api_key"] = os.environ["ALPACA_API_KEY"].strip()
            if os.environ.get("ALPACA_API_SECRET"):
                cfg["alpaca_api_secret"] = os.environ["ALPACA_API_SECRET"].strip()
            if os.environ.get("B3_API_KEY"):
                cfg["b3_api_key"] = os.environ["B3_API_KEY"].strip()
            if os.environ.get("B3_API_SECRET"):
                cfg["b3_api_secret"] = os.environ["B3_API_SECRET"].strip()
            if os.environ.get("B3_API_TOKEN"):
                cfg["b3_api_token"] = os.environ["B3_API_TOKEN"].strip()
            return cfg
        except Exception:
            return dict(DEFAULT_CONFIG)

    def save_config(self, new_cfg: Dict):
        self.config.update(new_cfg)
        # Separate private local secrets from public config
        secret_keys = ["google_client_id", "google_client_secret", "binance_api_key", "binance_api_secret", "alpaca_api_key", "alpaca_api_secret", "b3_api_key", "b3_api_secret", "b3_api_token"]
        local_secrets = {k: self.config[k] for k in secret_keys if k in self.config and self.config[k]}
        if local_secrets:
            try:
                existing_local = {}
                if os.path.exists(CONFIG_LOCAL_PATH):
                    with open(CONFIG_LOCAL_PATH, "r", encoding="utf-8") as lf:
                        existing_local = json.load(lf)
                existing_local.update(local_secrets)
                with open(CONFIG_LOCAL_PATH, "w", encoding="utf-8") as lf:
                    json.dump(existing_local, lf, indent=2)
            except Exception:
                pass

        public_config = dict(self.config)
        for k in ["google_client_id", "google_client_secret"]:
            if k in public_config and public_config[k]:
                public_config[k] = ""  # Keep empty in version control to prevent push protection rejection

        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(public_config, f, indent=2)

    def get_binance_connector(self) -> BinanceConnector:
        cfg = self.load_config()
        api_key = cfg.get("binance_api_key", "").strip()
        api_secret = cfg.get("binance_api_secret", "").strip()
        testnet = bool(cfg.get("binance_testnet", False))
        is_paper = bool(cfg.get("paper", False)) or not bool(api_key and api_secret)

        return BinanceConnector(
            api_key=api_key,
            api_secret=api_secret,
            testnet=testnet,
            paper=is_paper
        )

    def get_alpaca_connector(self) -> AlpacaConnector:
        cfg = self.load_config()
        return AlpacaConnector(
            api_key=cfg.get("alpaca_api_key", "").strip(),
            api_secret=cfg.get("alpaca_api_secret", "").strip(),
            paper=bool(cfg.get("alpaca_paper", True))
        )

    def get_b3_connector(self):
        """Returns the active B3 connector.
        Defaults to Cloud REST API (BTG Pactual, Genial, Cedro, XP) without needing PC/MetaTrader.
        """
        cfg = self.load_config()
        conn_type = cfg.get("b3_connection_type", "cloud_api")
        if conn_type == "mt5_desktop":
            return B3MT5Connector()
        return B3CloudAPIConnector(
            provider=cfg.get("b3_provider", "btg_pactual"),
            api_key=cfg.get("b3_api_key", "").strip(),
            api_secret=cfg.get("b3_api_secret", "").strip(),
            account=cfg.get("b3_account", "").strip(),
            token=cfg.get("b3_api_token", "").strip(),
            environment="live" if cfg.get("b3_cloud_live", False) else "sandbox",
            endpoint=cfg.get("b3_cloud_endpoint", "").strip()
        )

    def get_mt5_connector(self):
        """Backwards compatibility: routes to active B3 connector."""
        return self.get_b3_connector()

    def load_tickets(self) -> List[Dict]:
        try:
            with open(TICKETS_STATE_PATH, "r", encoding="utf-8") as f:
                return json.load(f).get("tickets", [])
        except Exception:
            return []

    def save_tickets(self, tickets: List[Dict]):
        with open(TICKETS_STATE_PATH, "w", encoding="utf-8") as f:
            json.dump({"tickets": tickets}, f, indent=2)

    def propose_order(self, symbol: str, side: str, market: str,
                      notional: float = None, qty: float = None,
                      order_type: str = "market", limit_price: float = None,
                      stop_loss: float = None, take_profit: float = None,
                      rationale: str = "") -> Dict:
        """Creates a proposed order ticket and runs the risk check."""
        cfg = self.load_config()
        sym = symbol.strip().upper()
        side = side.strip().lower()

        t_id = f"TICK-{int(time.time() * 1000)}"

        raw_order = {
            "symbol": sym,
            "side": side,
            "type": order_type,
            "time_in_force": "day",
        }
        if notional:
            raw_order["notional"] = str(round(notional, 2))
        elif qty:
            raw_order["qty"] = str(qty)

        if limit_price:
            raw_order["limit_price"] = str(round(limit_price, 4 if limit_price < 10 else 2))

        prices = {}
        if os.path.exists(PRICES_PATH):
            try:
                with open(PRICES_PATH, "r", encoding="utf-8") as f:
                    prices = json.load(f).get("prices", {})
            except Exception:
                pass

        if limit_price:
            prices[sym] = limit_price

        portfolio = {"cash": cfg.get("budget", 100.0), "positions": []}
        if os.path.exists(PORTFOLIO_PATH):
            try:
                with open(PORTFOLIO_PATH, "r", encoding="utf-8") as f:
                    portfolio = json.load(f)
            except Exception:
                pass

        risk_result = risk_check.check([raw_order], cfg, portfolio=portfolio, prices=prices)
        item_verdict = risk_result["results"][0]

        verdict = item_verdict["verdict"]
        reasons = item_verdict.get("reasons", [])
        warnings = item_verdict.get("warnings", [])

        # 1. Whitelist Cripto check (configurável pelo usuário)
        if (market.lower() in ("binance", "crypto") or sym.endswith("USDT")) and cfg.get("crypto_whitelist_enabled", False):
            clean_asset = sym.replace("USDT", "").replace("BUSD", "").replace("USDC", "").strip()
            allowed_whitelist = [s.strip().upper() for s in cfg.get("crypto_whitelist", []) if s.strip()]
            if clean_asset not in allowed_whitelist:
                verdict = "BLOCK"
                reasons.append(f"Whitelist Cripto Ativa: {sym} não está na lista de moedas autorizadas ({', '.join(allowed_whitelist)}).")

        # 2. Validação Mercado Internacional (US)
        if market.upper() in ("US", "ALPACA", "STOCKS"):
            if not cfg.get("us_market_enabled", True):
                verdict = "BLOCK"
                reasons.append("Mercado Internacional (US) está desativado nas configurações.")
            us_max = float(cfg.get("us_max_order_usd", 25.0))
            if notional and notional > us_max:
                verdict = "BLOCK"
                reasons.append(f"Ordem de ${notional:.2f} excede o limite máximo para mercado US (${us_max:.2f}).")

        # 3. Validação Mercado Brasileiro (B3)
        if market.upper() in ("B3", "MT5", "BRASIL"):
            if not cfg.get("b3_market_enabled", True):
                verdict = "BLOCK"
                reasons.append("Mercado B3 (Brasil) está desativado nas configurações.")
            b3_max = float(cfg.get("b3_max_order_brl", 250.0))
            if notional and notional > b3_max:
                verdict = "BLOCK"
                reasons.append(f"Ordem de R${notional:.2f} excede o limite máximo para B3 (R${b3_max:.2f}).")

        status = "READY" if verdict == "PASS" else "BLOCKED"

        ticket = {
            "id": t_id,
            "created_at": datetime.datetime.now().isoformat(),
            "symbol": sym,
            "side": side.upper(),
            "market": market,
            "order_type": order_type.upper(),
            "notional": notional,
            "qty": qty,
            "price": limit_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "status": status,
            "verdict": verdict,
            "reasons": reasons,
            "warnings": warnings,
            "rationale": rationale,
            "approved_at": None,
            "executed_at": None,
            "execution_result": None,
        }

        tickets = self.load_tickets()
        tickets.insert(0, ticket)
        self.save_tickets(tickets)
        return ticket

    def approve_ticket(self, ticket_id: str) -> Dict:
        """Approves a ticket (User explicit Yes)."""
        tickets = self.load_tickets()
        target = None
        for t in tickets:
            if t["id"] == ticket_id:
                if t["status"] not in ("READY", "PROPOSED"):
                    raise ValueError(f"Ordem não pode ser aprovada no status atual: {t['status']}")
                t["status"] = "APPROVED"
                t["approved_at"] = datetime.datetime.now().isoformat()
                target = t
                break

        if not target:
            raise ValueError(f"Ticket não encontrado: {ticket_id}")

        self.save_tickets(tickets)
        return target

    def execute_ticket(self, ticket_id: str) -> Dict:
        """Executes an approved ticket via Binance, Alpaca (US), or MT5 (B3)."""
        tickets = self.load_tickets()
        target = None
        for t in tickets:
            if t["id"] == ticket_id:
                target = t
                break

        if not target:
            raise ValueError(f"Ticket não encontrado: {ticket_id}")

        if target["status"] != "APPROVED":
            raise ValueError(f"Ticket precisa ser aprovado antes da execução (Status: {target['status']})")

        market = target.get("market", "").upper()
        symbol = target["symbol"]
        side = target["side"]
        notional = target.get("notional")
        qty = target.get("qty")
        price = target.get("price")
        sl = target.get("stop_loss")
        tp = target.get("take_profit")

        execution_result = {}

        if market == "BINANCE" or symbol.endswith("USDT") or symbol in POPULAR_CRYPTO_ASSETS:
            # 1. Binance Crypto Execution
            connector = self.get_binance_connector()
            execution_result = connector.create_order(
                symbol=symbol,
                side=side,
                order_type=target.get("order_type", "MARKET"),
                quantity=qty,
                notional=notional,
                price=price
            )
        elif market == "US" or (not symbol.endswith("USDT") and not any(symbol.endswith(x) for x in ["3", "4", "5", "6", "11", ".SA"])):
            # 2. Alpaca US Stocks Execution
            alpaca = self.get_alpaca_connector()
            execution_result = alpaca.create_order(
                symbol=symbol,
                side=side,
                notional=notional,
                qty=qty,
                order_type=target.get("order_type", "market").lower(),
                limit_price=price,
                stop_loss=sl,
                take_profit=tp
            )
        elif market == "B3" or any(symbol.endswith(x) for x in ["3", "4", "5", "6", "11", ".SA"]):
            # 3. B3 Execution (Cloud Direct API - BTG/Genial/Cedro/XP sem MT5)
            b3_conn = self.get_b3_connector()
            order_qty = int(qty) if qty else (100 if notional and notional > 500 else 10)
            execution_result = b3_conn.create_order(
                symbol=symbol,
                side=side,
                qty=order_qty,
                limit_price=price,
                stop_loss=sl,
                take_profit=tp
            )
        else:
            raise ValueError(f"Mercado não suportado para execução: {market}")

        target["status"] = "EXECUTED"
        target["executed_at"] = datetime.datetime.now().isoformat()
        target["execution_result"] = execution_result

        self.save_tickets(tickets)
        return target

    def cancel_ticket(self, ticket_id: str) -> Dict:
        """Cancels a ticket."""
        tickets = self.load_tickets()
        target = None
        for t in tickets:
            if t["id"] == ticket_id:
                if t["status"] == "EXECUTED":
                    raise ValueError("Não é possível cancelar uma ordem já executada.")
                t["status"] = "CANCELLED"
                target = t
                break

        if not target:
            raise ValueError(f"Ticket não encontrado: {ticket_id}")

        self.save_tickets(tickets)
        return target
