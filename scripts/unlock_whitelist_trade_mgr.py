import os

path = os.path.join("backend", "trade_manager.py")
with open(path, "rb") as f:
    text = f.read().decode("utf-8").replace("\r\n", "\n")

target_import = "from trader_binance.connector import BinanceConnector, WHITELIST_ASSETS, WHITELIST_SYMBOLS"
replacement_import = "from trader_binance.connector import BinanceConnector, POPULAR_CRYPTO_ASSETS, POPULAR_CRYPTO_SYMBOLS"
text = text.replace(target_import, replacement_import)

target_block = '''        # Strict Binance Whitelist verification if crypto
        if market.lower() == "binance" or sym.endswith("USDT") or sym in WHITELIST_ASSETS:
            clean_asset = sym.replace("USDT", "")
            if clean_asset not in WHITELIST_ASSETS:
                verdict = "BLOCK"
                reasons.append(f"Whitelist Binance: {sym} não é permitido. Apenas BTC, ETH, AAVE, SOL, LINK.")'''

replacement_block = '''        # Whitelist check (optional, disabled by default per user instruction)
        if cfg.get("enforce_whitelist") and (market.lower() == "binance" or sym.endswith("USDT")):
            clean_asset = sym.replace("USDT", "")
            if clean_asset not in ("BTC", "ETH", "AAVE", "SOL", "LINK"):
                verdict = "BLOCK"
                reasons.append(f"Whitelist Binance: {sym} não é permitido.")'''

assert target_block in text, "target_block not found in trade_manager.py"
text = text.replace(target_block, replacement_block)

target_market_check = 'if market == "BINANCE" or symbol.endswith("USDT") or symbol in WHITELIST_ASSETS:'
replacement_market_check = 'if market == "BINANCE" or symbol.endswith("USDT") or symbol in POPULAR_CRYPTO_ASSETS:'
text = text.replace(target_market_check, replacement_market_check)

with open(path, "wb") as f:
    f.write(text.encode("utf-8"))

print("Updated backend/trade_manager.py successfully")
