import os

path = os.path.join("frontend", "app.js")
with open(path, "rb") as f:
    text = f.read().decode("utf-8")

if "function loadCustomCrypto()" not in text:
    extra = """

// Load Custom Crypto pair
function loadCustomCrypto() {
  const input = document.getElementById('customCryptoInput');
  if (!input) return;
  const val = input.value.trim().toUpperCase();
  if (!val) return;
  let sym = val;
  if (!sym.endsWith('USDT') && !sym.endsWith('BTC') && !sym.endsWith('ETH')) {
    sym = `${sym}USDT`;
  }
  selectCrypto(sym);
  input.value = '';
  showToast(`Carregado par ${sym}`);
}
"""
    text += extra
    with open(path, "wb") as f:
        f.write(text.encode("utf-8"))
    print("Added loadCustomCrypto to frontend/app.js")
else:
    print("Already exists")
