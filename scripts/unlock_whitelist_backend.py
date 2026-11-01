import os

path = os.path.join("backend", "main.py")
with open(path, "rb") as f:
    text = f.read().decode("utf-8").replace("\r\n", "\n")

target_imp = "from trader_binance.connector import BinanceConnector, WHITELIST_ASSETS, WHITELIST_SYMBOLS, BinanceSecurityError"
replacement_imp = "from trader_binance.connector import BinanceConnector, POPULAR_CRYPTO_ASSETS, POPULAR_CRYPTO_SYMBOLS, BinanceSecurityError"
text = text.replace(target_imp, replacement_imp)

target_health = '''        "binance": {
            "live": cfg.get("binance_live", False),
            "testnet": cfg.get("binance_testnet", False),
            "has_keys": bool(cfg.get("binance_api_key")),
            "whitelisted_crypto": sorted(list(WHITELIST_ASSETS))
        },'''

replacement_health = '''        "binance": {
            "live": cfg.get("binance_live", False),
            "testnet": cfg.get("binance_testnet", False),
            "has_keys": bool(cfg.get("binance_api_key")),
            "whitelist_unlocked": True,
            "popular_crypto": POPULAR_CRYPTO_ASSETS
        },'''
text = text.replace(target_health, replacement_health)

target_rec = "for sym in sorted(WHITELIST_SYMBOLS):"
replacement_rec = 'for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "AAVEUSDT"]:'
text = text.replace(target_rec, replacement_rec)

with open(path, "wb") as f:
    f.write(text.encode("utf-8"))

print("Updated backend/main.py successfully")
