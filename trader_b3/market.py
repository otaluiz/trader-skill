#!/usr/bin/env python3
"""Market data provider for Brazilian Stocks (B3).
Fetches quotes, daily changes, and OHLCV candlestick data.
"""

import requests
import re
from typing import List, Dict, Optional

# Popular default B3 watchlist
DEFAULT_B3_WATCHLIST = [
    "PETR4", "VALE3", "ITUB4", "BBDC4", "WEGE3",
    "BBAS3", "RENT3", "MGLU3", "PRIO3", "ABEV3"
]

B3_TICKER_REGEX = re.compile(r"^[A-Z]{4}(3|4|5|6|11)(\.SA)?$", re.IGNORECASE)


def normalize_b3_ticker(symbol: str) -> str:
    """Ensures ticker has .SA suffix for Yahoo Finance queries."""
    sym = symbol.strip().upper()
    if not sym.endswith(".SA"):
        sym = f"{sym}.SA"
    return sym


def display_b3_ticker(symbol: str) -> str:
    """Returns clean ticker without .SA for UI display (e.g. PETR4)."""
    return symbol.replace(".SA", "").strip().upper()


class B3Market:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def is_valid_b3_ticker(self, ticker: str) -> bool:
        return bool(B3_TICKER_REGEX.match(ticker.strip()))

    def get_quote(self, raw_symbol: str) -> Optional[Dict]:
        """Fetches latest quote data for a B3 ticker."""
        symbol_sa = normalize_b3_ticker(raw_symbol)
        clean_symbol = display_b3_ticker(raw_symbol)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol_sa}?range=5d&interval=1d"

        try:
            r = requests.get(url, headers=self.headers, timeout=6)
            if r.status_code != 200:
                return None
            data = r.json()
            result = data.get("chart", {}).get("result", [])
            if not result:
                return None

            meta = result[0].get("meta", {})
            indicators = result[0].get("indicators", {}).get("quote", [{}])[0]
            closes = indicators.get("close", [])
            volumes = indicators.get("volume", [])

            # Get latest valid close
            valid_closes = [c for c in closes if c is not None]
            last_price = meta.get("regularMarketPrice") or (valid_closes[-1] if valid_closes else 0.0)
            prev_close = meta.get("chartPreviousClose") or (valid_closes[-2] if len(valid_closes) > 1 else last_price)
            
            change_pct = 0.0
            if prev_close and prev_close > 0:
                change_pct = round(((last_price - prev_close) / prev_close) * 100, 2)

            last_vol = volumes[-1] if volumes and volumes[-1] is not None else 0

            return {
                "symbol": clean_symbol,
                "symbol_full": symbol_sa,
                "market": "B3",
                "currency": "BRL",
                "price": round(float(last_price), 2),
                "change_24h_pct": float(change_pct),
                "high_24h": round(float(meta.get("regularMarketDayHigh", last_price)), 2),
                "low_24h": round(float(meta.get("regularMarketDayLow", last_price)), 2),
                "volume": int(last_vol),
            }
        except Exception:
            return None

    def get_watchlist_quotes(self, tickers: List[str] = None) -> List[Dict]:
        """Fetches quotes for a list of B3 tickers."""
        watchlist = tickers or DEFAULT_B3_WATCHLIST
        quotes = []
        for t in watchlist:
            q = self.get_quote(t)
            if q:
                quotes.append(q)
            else:
                quotes.append({
                    "symbol": display_b3_ticker(t),
                    "symbol_full": normalize_b3_ticker(t),
                    "market": "B3",
                    "currency": "BRL",
                    "price": 0.0,
                    "change_24h_pct": 0.0,
                    "high_24h": 0.0,
                    "low_24h": 0.0,
                    "volume": 0
                })
        return quotes

    def get_klines(self, raw_symbol: str, range_period: str = "1mo", interval: str = "1d") -> List[Dict]:
        """Fetches historical candlestick data for charts and technical indicators."""
        symbol_sa = normalize_b3_ticker(raw_symbol)
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol_sa}?range={range_period}&interval={interval}"

        try:
            r = requests.get(url, headers=self.headers, timeout=6)
            if r.status_code != 200:
                return []
            data = r.json()
            result = data.get("chart", {}).get("result", [])
            if not result:
                return []

            timestamps = result[0].get("timestamp", [])
            quote = result[0].get("indicators", {}).get("quote", [{}])[0]
            opens = quote.get("open", [])
            highs = quote.get("high", [])
            lows = quote.get("low", [])
            closes = quote.get("close", [])
            volumes = quote.get("volume", [])

            candles = []
            for i in range(len(timestamps)):
                if (opens[i] is not None and highs[i] is not None and
                        lows[i] is not None and closes[i] is not None):
                    candles.append({
                        "time": int(timestamps[i]) * 1000,
                        "open": round(float(opens[i]), 2),
                        "high": round(float(highs[i]), 2),
                        "low": round(float(lows[i]), 2),
                        "close": round(float(closes[i]), 2),
                        "volume": int(volumes[i] or 0),
                    })
            return candles
        except Exception:
            return []
