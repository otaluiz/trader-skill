"""Binance trading module for trader-skill.
Supports all Binance spot pairs with popular defaults.
"""
from .connector import BinanceConnector, POPULAR_CRYPTO_ASSETS, POPULAR_CRYPTO_SYMBOLS, BinanceSecurityError, BinanceAPIError

__all__ = ["BinanceConnector", "POPULAR_CRYPTO_ASSETS", "POPULAR_CRYPTO_SYMBOLS", "BinanceSecurityError", "BinanceAPIError"]
