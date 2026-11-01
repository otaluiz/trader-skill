#!/usr/bin/env python3
"""Binance connector with open crypto trading (whitelist unlocked).
Supports BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, AAVE, and all valid Binance spot pairs.
"""

import hashlib
import hmac
import json
import os
import re
import time
from urllib.parse import urlencode
import requests

# Default popular crypto assets for dashboard overview
POPULAR_CRYPTO_ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "AAVE", "NEAR", "SUI"]
POPULAR_CRYPTO_SYMBOLS = [f"{asset}USDT" for asset in POPULAR_CRYPTO_ASSETS]

SYMBOL_REGEX = re.compile(r"^[A-Z0-9]{2,12}(USDT|BUSD|FDUSD|USDC|BTC|ETH)?$")

# Known specific trading precision rules (fallback available for any coin)
SYMBOL_RULES = {
    "BTCUSDT": {"min_qty": 0.00001, "step_size": 0.00001, "min_notional": 5.0, "price_precision": 2, "qty_precision": 5},
    "ETHUSDT": {"min_qty": 0.0001, "step_size": 0.0001, "min_notional": 5.0, "price_precision": 2, "qty_precision": 4},
    "BNBUSDT": {"min_qty": 0.001, "step_size": 0.001, "min_notional": 5.0, "price_precision": 2, "qty_precision": 3},
    "SOLUSDT": {"min_qty": 0.01, "step_size": 0.01, "min_notional": 5.0, "price_precision": 2, "qty_precision": 2},
    "AAVEUSDT": {"min_qty": 0.001, "step_size": 0.001, "min_notional": 5.0, "price_precision": 2, "qty_precision": 3},
    "LINKUSDT": {"min_qty": 0.01, "step_size": 0.01, "min_notional": 5.0, "price_precision": 3, "qty_precision": 2},
    "XRPUSDT": {"min_qty": 0.1, "step_size": 0.1, "min_notional": 5.0, "price_precision": 4, "qty_precision": 1},
    "DOGEUSDT": {"min_qty": 1.0, "step_size": 1.0, "min_notional": 5.0, "price_precision": 5, "qty_precision": 0},
    "ADAUSDT": {"min_qty": 0.1, "step_size": 0.1, "min_notional": 5.0, "price_precision": 4, "qty_precision": 1},
    "AVAXUSDT": {"min_qty": 0.01, "step_size": 0.01, "min_notional": 5.0, "price_precision": 2, "qty_precision": 2},
}

DEFAULT_PAPER_BALANCES = {
    "USDT": 500.0,
    "BTC": 0.0,
    "ETH": 0.0,
    "SOL": 0.0,
    "BNB": 0.0,
    "XRP": 0.0,
    "DOGE": 0.0,
    "AAVE": 0.0,
    "LINK": 0.0,
}


class BinanceSecurityError(Exception):
    pass


class BinanceAPIError(Exception):
    pass


class BinanceConnector:
    def __init__(self, api_key: str = None, api_secret: str = None, testnet: bool = False, paper: bool = False):
        self.api_key = (api_key or os.getenv("BINANCE_API_KEY", "")).strip()
        self.api_secret = (api_secret or os.getenv("BINANCE_API_SECRET", "")).strip()
        self.testnet = testnet
        self.paper = paper or (not bool(self.api_key and self.api_secret))
        
        if self.testnet:
            self.base_url = "https://testnet.binance.vision"
        else:
            self.base_url = "https://api.binance.com"
            
        self.paper_state_file = os.path.join("trader", "state", "binance_paper_wallet.json")
        self._init_paper_wallet()

    def _init_paper_wallet(self):
        if not os.path.exists(self.paper_state_file):
            os.makedirs(os.path.dirname(self.paper_state_file), exist_ok=True)
            with open(self.paper_state_file, "w", encoding="utf-8") as f:
                json.dump(DEFAULT_PAPER_BALANCES, f, indent=2)

    def _get_paper_balances(self) -> dict:
        self._init_paper_wallet()
        try:
            with open(self.paper_state_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return dict(DEFAULT_PAPER_BALANCES)

    def _save_paper_balances(self, balances: dict):
        os.makedirs(os.path.dirname(self.paper_state_file), exist_ok=True)
        with open(self.paper_state_file, "w", encoding="utf-8") as f:
            json.dump(balances, f, indent=2)

    def validate_symbol(self, raw_symbol: str) -> str:
        """Normalizes symbol to uppercase and ensures USDT pair if not specified."""
        sym = raw_symbol.upper().strip().replace("/", "")
        quote_currencies = ("USDT", "BUSD", "FDUSD", "USDC", "BTC", "ETH")
        if not any(sym.endswith(q) for q in quote_currencies):
            sym = f"{sym}USDT"

        if not SYMBOL_REGEX.match(sym):
            raise BinanceSecurityError(f"Símbolo '{raw_symbol}' possui formato inválido para a Binance.")

        return sym

    def get_symbol_rules(self, symbol: str) -> dict:
        return SYMBOL_RULES.get(symbol, {
            "min_qty": 0.0001,
            "step_size": 0.0001,
            "min_notional": 5.0,
            "price_precision": 2 if "USDT" in symbol else 4,
            "qty_precision": 4
        })

    def _sign_params(self, params: dict) -> str:
        params["timestamp"] = int(time.time() * 1000)
        query = urlencode(params)
        signature = hmac.new(self.api_secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"{query}&signature={signature}"

    def _get_headers(self) -> dict:
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["X-MBX-APIKEY"] = self.api_key
        return headers

    def get_server_time(self) -> int:
        try:
            r = requests.get(f"{self.base_url}/api/v3/time", timeout=5)
            r.raise_for_status()
            return r.json().get("serverTime", int(time.time() * 1000))
        except Exception:
            return int(time.time() * 1000)

    def get_single_ticker(self, symbol: str) -> dict:
        sym = self.validate_symbol(symbol)
        try:
            r = requests.get(f"{self.base_url}/api/v3/ticker/24hr", params={"symbol": sym}, timeout=5)
            if r.status_code == 200:
                d = r.json()
                base = sym.replace("USDT", "")
                return {
                    "symbol": sym,
                    "asset": base,
                    "price": float(d.get("lastPrice", 0)),
                    "change_24h_pct": float(d.get("priceChangePercent", 0)),
                    "high_24h": float(d.get("highPrice", 0)),
                    "low_24h": float(d.get("lowPrice", 0)),
                    "volume_24h": float(d.get("volume", 0)),
                    "quote_volume": float(d.get("quoteVolume", 0)),
                }
        except Exception:
            pass
        return {"symbol": sym, "price": 0.0, "change_24h_pct": 0.0}

    def get_24hr_tickers(self, symbols: list = None) -> list:
        """Fetches 24h ticker for requested symbols or popular list."""
        target_symbols = [self.validate_symbol(s) for s in (symbols or POPULAR_CRYPTO_SYMBOLS)]
        results = []
        for symbol in target_symbols:
            t = self.get_single_ticker(symbol)
            if t.get("price", 0) > 0:
                results.append(t)
            else:
                base = symbol.replace("USDT", "")
                results.append({
                    "symbol": symbol,
                    "asset": base,
                    "price": 0.0,
                    "change_24h_pct": 0.0,
                    "high_24h": 0.0,
                    "low_24h": 0.0,
                    "volume_24h": 0.0,
                    "quote_volume": 0.0,
                })
        return results

    def get_klines(self, symbol: str, interval: str = "1h", limit: int = 50) -> list:
        """Fetches candlestick bars for charting and indicators."""
        sym = self.validate_symbol(symbol)
        url = f"{self.base_url}/api/v3/klines"
        params = {"symbol": sym, "interval": interval, "limit": limit}
        try:
            r = requests.get(url, params=params, timeout=5)
            r.raise_for_status()
            data = r.json()
            candles = []
            for item in data:
                candles.append({
                    "time": int(item[0]),
                    "open": float(item[1]),
                    "high": float(item[2]),
                    "low": float(item[3]),
                    "close": float(item[4]),
                    "volume": float(item[5]),
                })
            return candles
        except Exception as e:
            raise BinanceAPIError(f"Erro ao buscar candles de {sym}: {e}")

    def get_order_book(self, symbol: str, limit: int = 10) -> dict:
        """Fetches top bids and asks depth."""
        sym = self.validate_symbol(symbol)
        url = f"{self.base_url}/api/v3/depth"
        try:
            r = requests.get(url, params={"symbol": sym, "limit": limit}, timeout=5)
            r.raise_for_status()
            data = r.json()
            return {
                "symbol": sym,
                "bids": [[float(p), float(q)] for p, q in data.get("bids", [])],
                "asks": [[float(p), float(q)] for p, q in data.get("asks", [])],
            }
        except Exception as e:
            raise BinanceAPIError(f"Erro ao buscar livro de ofertas de {sym}: {e}")

    def get_account_balances(self) -> dict:
        """Returns spot wallet balances."""
        if self.paper or not self.api_key:
            balances = self._get_paper_balances()
            return {
                "mode": "paper_trading",
                "balances": [
                    {"asset": asset, "free": float(qty), "locked": 0.0}
                    for asset, qty in balances.items()
                ]
            }

        url = f"{self.base_url}/api/v3/account"
        signed_query = self._sign_params({})
        headers = self._get_headers()
        try:
            r = requests.get(f"{url}?{signed_query}", headers=headers, timeout=10)
            if r.status_code != 200:
                raise BinanceAPIError(f"Binance API ({r.status_code}): {r.text}")
            data = r.json()
            all_balances = data.get("balances", [])
            # Return any assets with non-zero balance
            filtered = [
                {"asset": b["asset"], "free": float(b["free"]), "locked": float(b["locked"])}
                for b in all_balances if float(b["free"]) > 0 or float(b["locked"]) > 0 or b["asset"] in ("USDT", "BTC", "ETH", "SOL")
            ]
            return {"mode": "live" if not self.testnet else "testnet", "balances": filtered}
        except Exception as e:
            raise BinanceAPIError(f"Falha ao consultar saldos na Binance: {e}")

    def create_order(self, symbol: str, side: str, order_type: str = "MARKET",
                     quantity: float = None, notional: float = None, price: float = None) -> dict:
        """Executes a buy or sell order for any valid crypto symbol."""
        sym = self.validate_symbol(symbol)
        side = side.upper().strip()
        if side not in ("BUY", "SELL"):
            raise BinanceSecurityError(f"Lado da ordem inválido: {side}")
            
        rules = self.get_symbol_rules(sym)
        base_asset = sym.replace("USDT", "")

        # Paper Execution
        if self.paper or not self.api_key:
            if price:
                current_price = price
            else:
                current_price = self.get_single_ticker(sym).get("price", 1.0)
            if current_price <= 0:
                current_price = 1.0

            if notional and not quantity:
                quantity = round(notional / current_price, rules.get("qty_precision", 4))
            elif quantity and not notional:
                notional = round(quantity * current_price, 2)

            balances = self._get_paper_balances()
            if side == "BUY":
                if balances.get("USDT", 0.0) < notional:
                    raise BinanceAPIError(f"Saldo insuficiente em USDT na simulação! Requerido: ${notional:.2f}, Disponível: ${balances.get('USDT', 0):.2f}")
                balances["USDT"] = round(balances.get("USDT", 0.0) - notional, 2)
                balances[base_asset] = round(balances.get(base_asset, 0.0) + quantity, rules.get("qty_precision", 4))
            else: # SELL
                if balances.get(base_asset, 0.0) < quantity:
                    raise BinanceAPIError(f"Saldo insuficiente em {base_asset} na simulação! Requerido: {quantity}, Disponível: {balances.get(base_asset, 0)}")
                balances[base_asset] = round(balances.get(base_asset, 0.0) - quantity, rules.get("qty_precision", 4))
                balances["USDT"] = round(balances.get("USDT", 0.0) + notional, 2)

            self._save_paper_balances(balances)

            order_id = int(time.time() * 1000)
            return {
                "order_id": order_id,
                "client_order_id": f"paper_{order_id}",
                "symbol": sym,
                "side": side,
                "type": order_type,
                "status": "FILLED",
                "executed_qty": quantity,
                "cumulative_quote_qty": notional,
                "price": current_price,
                "mode": "paper_trading",
                "time": int(time.time() * 1000)
            }

        # Real / Testnet Execution
        url = f"{self.base_url}/api/v3/order"
        params = {
            "symbol": sym,
            "side": side,
            "type": order_type,
        }

        if order_type == "MARKET":
            if quantity:
                params["quantity"] = f"{quantity:.{rules.get('qty_precision', 4)}f}"
            elif notional:
                params["quoteOrderQty"] = f"{notional:.2f}"
            else:
                raise BinanceAPIError("É necessário informar quantity ou quoteOrderQty (notional).")
        elif order_type == "LIMIT":
            if not quantity or not price:
                raise BinanceAPIError("Ordem LIMIT exige quantity e price.")
            params["quantity"] = f"{quantity:.{rules.get('qty_precision', 4)}f}"
            params["price"] = f"{price:.{rules.get('price_precision', 2)}f}"
            params["timeInForce"] = "GTC"

        signed_query = self._sign_params(params)
        headers = self._get_headers()

        try:
            r = requests.post(f"{url}?{signed_query}", headers=headers, timeout=10)
            if r.status_code != 200:
                err_data = r.json() if r.headers.get("content-type") == "application/json" else {}
                msg = err_data.get("msg", r.text)
                raise BinanceAPIError(f"Erro ao executar ordem na Binance ({r.status_code}): {msg}")
            res = r.json()
            return {
                "order_id": res.get("orderId"),
                "client_order_id": res.get("clientOrderId"),
                "symbol": res.get("symbol"),
                "side": res.get("side"),
                "type": res.get("type"),
                "status": res.get("status"),
                "executed_qty": float(res.get("executedQty", 0)),
                "cumulative_quote_qty": float(res.get("cummulativeQuoteQty", 0)),
                "price": float(res.get("price", 0)),
                "mode": "live" if not self.testnet else "testnet",
                "time": res.get("transactTime", int(time.time() * 1000))
            }
        except Exception as e:
            raise BinanceAPIError(f"Falha na execução da ordem Binance: {e}")
