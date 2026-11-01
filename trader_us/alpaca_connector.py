#!/usr/bin/env python3
"""Alpaca Trading Connector for US Stocks & ETFs.
Supports both Alpaca Paper Trading and Live Trading via official REST API v2.
"""

import json
import os
import time
from typing import Dict, List, Optional
import requests

DEFAULT_PAPER_URL = "https://paper-api.alpaca.markets"
DEFAULT_LIVE_URL = "https://api.alpaca.markets"


class AlpacaConnector:
    def __init__(self, api_key: str = None, api_secret: str = None, paper: bool = True):
        self.api_key = (api_key or os.getenv("APCA_API_KEY_ID", "")).strip()
        self.api_secret = (api_secret or os.getenv("APCA_API_SECRET_KEY", "")).strip()
        self.paper = paper
        self.base_url = DEFAULT_PAPER_URL if self.paper else DEFAULT_LIVE_URL
        self.paper_state_file = os.path.join("trader", "state", "alpaca_paper_wallet.json")
        self._init_paper_wallet()

    def _init_paper_wallet(self):
        if not os.path.exists(self.paper_state_file):
            os.makedirs(os.path.dirname(self.paper_state_file), exist_ok=True)
            with open(self.paper_state_file, "w", encoding="utf-8") as f:
                json.dump({"cash": 1000.0, "positions": {}}, f, indent=2)

    def _get_headers(self) -> Dict[str, str]:
        return {
            "APCA-API-KEY-ID": self.api_key,
            "APCA-API-SECRET-KEY": self.api_secret,
            "Content-Type": "application/json"
        }

    def has_credentials(self) -> bool:
        return bool(self.api_key and self.api_secret)

    def get_account(self) -> Dict:
        """Fetches account balance and status from Alpaca or simulated wallet."""
        if not self.has_credentials():
            # Return local simulation wallet
            try:
                with open(self.paper_state_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception:
                data = {"cash": 1000.0, "positions": {}}
            return {
                "mode": "simulation_local",
                "status": "ACTIVE",
                "currency": "USD",
                "buying_power": data.get("cash", 1000.0),
                "cash": data.get("cash", 1000.0),
                "portfolio_value": data.get("cash", 1000.0)
            }

        url = f"{self.base_url}/v2/account"
        try:
            r = requests.get(url, headers=self._get_headers(), timeout=8)
            if r.status_code == 200:
                d = r.json()
                return {
                    "mode": "alpaca_paper" if self.paper else "alpaca_live",
                    "status": d.get("status"),
                    "currency": d.get("currency", "USD"),
                    "buying_power": float(d.get("buying_power", 0)),
                    "cash": float(d.get("cash", 0)),
                    "portfolio_value": float(d.get("portfolio_value", 0))
                }
            return {"mode": "error", "error": f"Status {r.status_code}: {r.text}"}
        except Exception as e:
            return {"mode": "error", "error": str(e)}

    def create_order(self, symbol: str, side: str, notional: float = None,
                     qty: float = None, order_type: str = "market",
                     limit_price: float = None, stop_loss: float = None,
                     take_profit: float = None) -> Dict:
        """Submits an order to Alpaca REST API or local simulated broker."""
        sym = symbol.strip().upper().replace(".", "-")
        side = side.strip().lower()

        # Local simulation fallback if no credentials
        if not self.has_credentials():
            try:
                with open(self.paper_state_file, "r", encoding="utf-8") as f:
                    wallet = json.load(f)
            except Exception:
                wallet = {"cash": 1000.0, "positions": {}}

            order_val = notional or ((qty or 1.0) * (limit_price or 150.0))
            if side == "buy":
                if wallet.get("cash", 0) < order_val:
                    raise ValueError(f"Saldo insuficiente na simulação Alpaca! Requerido: ${order_val:.2f}, Saldo: ${wallet.get('cash', 0):.2f}")
                wallet["cash"] = round(wallet.get("cash", 0) - order_val, 2)
                cur_qty = wallet.get("positions", {}).get(sym, 0.0)
                add_qty = qty or round(order_val / (limit_price or 150.0), 3)
                wallet.setdefault("positions", {})[sym] = round(cur_qty + add_qty, 3)
            else:
                wallet["cash"] = round(wallet.get("cash", 0) + order_val, 2)
                cur_qty = wallet.get("positions", {}).get(sym, 0.0)
                rem_qty = qty or round(order_val / (limit_price or 150.0), 3)
                wallet.setdefault("positions", {})[sym] = max(0.0, round(cur_qty - rem_qty, 3))

            with open(self.paper_state_file, "w", encoding="utf-8") as f:
                json.dump(wallet, f, indent=2)

            return {
                "order_id": f"alpaca_sim_{int(time.time() * 1000)}",
                "symbol": sym,
                "side": side,
                "status": "filled",
                "filled_qty": qty or round(order_val / (limit_price or 150.0), 3),
                "filled_avg_price": limit_price or 150.0,
                "value": order_val,
                "mode": "alpaca_simulation",
                "time": int(time.time() * 1000)
            }

        # Real Alpaca API request
        url = f"{self.base_url}/v2/orders"
        payload = {
            "symbol": sym,
            "side": side,
            "type": order_type.lower(),
            "time_in_force": "day"
        }
        if notional:
            payload["notional"] = str(round(notional, 2))
        elif qty:
            payload["qty"] = str(qty)

        if limit_price and order_type.lower() == "limit":
            payload["limit_price"] = str(round(limit_price, 2))

        # Bracket Order: Stop Loss / Take Profit
        if take_profit or stop_loss:
            payload["order_class"] = "bracket"
            if take_profit:
                payload["take_profit"] = {"limit_price": str(round(take_profit, 2))}
            if stop_loss:
                payload["stop_loss"] = {"stop_price": str(round(stop_loss, 2))}

        try:
            r = requests.post(url, headers=self._get_headers(), json=payload, timeout=10)
            if r.status_code not in (200, 201):
                err = r.json() if r.headers.get("content-type") == "application/json" else {}
                msg = err.get("message", r.text)
                raise ValueError(f"Alpaca API ({r.status_code}): {msg}")

            data = r.json()
            return {
                "order_id": data.get("id"),
                "client_order_id": data.get("client_order_id"),
                "symbol": data.get("symbol"),
                "side": data.get("side"),
                "status": data.get("status"),
                "filled_qty": float(data.get("filled_qty", 0)),
                "filled_avg_price": float(data.get("filled_avg_price", 0) or 0),
                "mode": "alpaca_paper" if self.paper else "alpaca_live",
                "time": int(time.time() * 1000)
            }
        except Exception as e:
            raise ValueError(f"Falha ao enviar ordem para Alpaca: {e}")
