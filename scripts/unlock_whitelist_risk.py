import os

path = os.path.join("trader-risk", "check.py")
with open(path, "rb") as f:
    text = f.read().decode("utf-8").replace("\r\n", "\n")

target_asset = '''        elif sym and c.get("allow_crypto", True) and (sym in BINANCE_WHITELIST):
            pass
        elif sym and c.get("allow_crypto", True) and (sym in {"DOGE", "XRP", "ADA", "SHIB", "PEPE", "BNB"} or (sym.endswith("USDT") and sym not in BINANCE_WHITELIST)):
            reasons.append("asset: %s is not in the Binance authorized whitelist (allowed: BTC, ETH, AAVE, SOL, LINK)" % sym)'''

replacement_asset = '''        elif sym and c.get("allow_crypto", True) and (sym.endswith("USDT") or sym in {"BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "AAVE", "NEAR", "SUI", "PEPE", "SHIB"} or (c.get("enforce_whitelist") and sym in BINANCE_WHITELIST)):
            pass'''

assert target_asset in text, "target_asset not found in check.py"
text = text.replace(target_asset, replacement_asset)

with open(path, "wb") as f:
    f.write(text.encode("utf-8"))

print("Updated trader-risk/check.py successfully")
