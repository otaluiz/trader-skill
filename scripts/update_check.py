import os

path = os.path.join("trader-risk", "check.py")
with open(path, "rb") as f:
    raw = f.read()

# Normalize CRLF to LF for reliable manipulation
text = raw.decode("utf-8").replace("\r\n", "\n")

target_decl = 'TICKER = re.compile(r"^[A-Z]{1,5}([.\\-][A-Z]{1,2})?$")\nCENT = 0.005'
replacement_decl = '''TICKER = re.compile(r"^[A-Z]{1,5}([.\\-][A-Z]{1,2})?$")
B3_TICKER = re.compile(r"^[A-Z]{4}(3|4|5|6|11)(\\.SA)?$")
BINANCE_WHITELIST = {"BTC", "ETH", "AAVE", "SOL", "LINK", "BTCUSDT", "ETHUSDT", "AAVEUSDT", "SOLUSDT", "LINKUSDT"}
CENT = 0.005'''

assert target_decl in text, "target_decl not found"
text = text.replace(target_decl, replacement_decl)

target_asset = '''        elif sym and ("/" in sym or not TICKER.match(sym)):
            reasons.append("asset: %s does not look like a US stock or ETF ticker; "
                           "this pack trades stocks and ETFs only" % sym)'''

replacement_asset = '''        elif sym and ("/" in sym):
            reasons.append("asset: %s does not look like a US stock or ETF ticker; "
                           "this pack trades stocks and ETFs only" % sym)
        elif sym and c.get("allow_crypto", True) and (sym in BINANCE_WHITELIST):
            pass
        elif sym and c.get("allow_crypto", True) and (sym in {"DOGE", "XRP", "ADA", "SHIB", "PEPE", "BNB"} or (sym.endswith("USDT") and sym not in BINANCE_WHITELIST)):
            reasons.append("asset: %s is not in the Binance authorized whitelist (allowed: BTC, ETH, AAVE, SOL, LINK)" % sym)
        elif sym and c.get("allow_b3", True) and B3_TICKER.match(sym):
            pass
        elif sym and not TICKER.match(sym):
            reasons.append("asset: %s does not look like a US stock or ETF ticker; "
                           "this pack trades stocks and ETFs only" % sym)'''

assert target_asset in text, "target_asset not found"
text = text.replace(target_asset, replacement_asset)

with open(path, "wb") as f:
    f.write(text.encode("utf-8"))

print("Successfully updated trader-risk/check.py")
