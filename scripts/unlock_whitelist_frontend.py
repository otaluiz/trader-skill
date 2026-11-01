import os

path = os.path.join("frontend", "index.html")
with open(path, "rb") as f:
    text = f.read().decode("utf-8").replace("\r\n", "\n")

target_banner = '''      <!-- Whitelist Alert Banner -->
      <div class="p-4 rounded-xl bg-binance/5 border border-binance/20 flex items-start justify-between">
        <div class="flex items-start space-x-3">
          <i class="ph-bold ph-shield-check text-2xl text-binance mt-0.5"></i>
          <div>
            <h3 class="font-bold text-white text-sm">Trava de Segurança Ativa: Somente 5 Criptomoedas Permitidas</h3>
            <p class="text-xs text-slate-400 mt-0.5">Conforme sua instrução estrita, o sistema opera exclusivamente <strong class="text-white">BTC, ETH, AAVE, SOL e LINK</strong> (pares USDT). Qualquer outra ordem é rejeitada.</p>
          </div>
        </div>
        <span class="text-xs px-2.5 py-1 rounded bg-slate-800 text-binance font-semibold mono">WHITELIST ATIVA</span>
      </div>'''

replacement_banner = '''      <!-- Whitelist Unlocked Banner -->
      <div class="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-start justify-between">
        <div class="flex items-start space-x-3">
          <i class="ph-bold ph-lock-open text-2xl text-emerald-400 mt-0.5"></i>
          <div>
            <h3 class="font-bold text-white text-sm">Mercado Binance Spot Totalmente Liberado</h3>
            <p class="text-xs text-slate-400 mt-0.5">A whitelist foi liberada. Você pode operar <strong class="text-white">qualquer criptomoeda</strong> listada na Binance Spot (BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, AAVE, PEPE, SUI, etc.).</p>
          </div>
        </div>
        <span class="text-xs px-2.5 py-1 rounded bg-slate-800 text-emerald-400 font-semibold mono">TODOS OS PARES</span>
      </div>'''

assert target_banner in text, "target_banner not found"
text = text.replace(target_banner, replacement_banner)

target_pills = '''          <!-- Coin Selector Pills -->
          <div class="flex flex-wrap gap-2">
            <button onclick="selectCrypto('BTCUSDT')" id="cbtn-BTCUSDT" class="crypto-btn px-4 py-2 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center space-x-2 border border-binance">
              <span class="w-2 h-2 rounded-full bg-binance"></span>
              <span>BTC / USDT</span>
            </button>
            <button onclick="selectCrypto('ETHUSDT')" id="cbtn-ETHUSDT" class="crypto-btn px-4 py-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-2 border border-cardBorder">
              <span>ETH / USDT</span>
            </button>
            <button onclick="selectCrypto('AAVEUSDT')" id="cbtn-AAVEUSDT" class="crypto-btn px-4 py-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-2 border border-cardBorder">
              <span>AAVE / USDT</span>
            </button>
            <button onclick="selectCrypto('SOLUSDT')" id="cbtn-SOLUSDT" class="crypto-btn px-4 py-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-2 border border-cardBorder">
              <span>SOL / USDT</span>
            </button>
            <button onclick="selectCrypto('LINKUSDT')" id="cbtn-LINKUSDT" class="crypto-btn px-4 py-2 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-2 border border-cardBorder">
              <span>LINK / USDT</span>
            </button>
          </div>'''

replacement_pills = '''          <!-- Coin Selector Pills -->
          <div class="flex flex-wrap items-center gap-2">
            <button onclick="selectCrypto('BTCUSDT')" id="cbtn-BTCUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-800 text-white font-bold text-xs flex items-center space-x-1.5 border border-binance">
              <span class="w-2 h-2 rounded-full bg-binance"></span>
              <span>BTC</span>
            </button>
            <button onclick="selectCrypto('ETHUSDT')" id="cbtn-ETHUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1.5 border border-cardBorder">
              <span>ETH</span>
            </button>
            <button onclick="selectCrypto('SOLUSDT')" id="cbtn-SOLUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1.5 border border-cardBorder">
              <span>SOL</span>
            </button>
            <button onclick="selectCrypto('BNBUSDT')" id="cbtn-BNBUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1.5 border border-cardBorder">
              <span>BNB</span>
            </button>
            <button onclick="selectCrypto('XRPUSDT')" id="cbtn-XRPUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1.5 border border-cardBorder">
              <span>XRP</span>
            </button>
            <button onclick="selectCrypto('DOGEUSDT')" id="cbtn-DOGEUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1.5 border border-cardBorder">
              <span>DOGE</span>
            </button>
            <button onclick="selectCrypto('AAVEUSDT')" id="cbtn-AAVEUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1.5 border border-cardBorder">
              <span>AAVE</span>
            </button>
            <button onclick="selectCrypto('LINKUSDT')" id="cbtn-LINKUSDT" class="crypto-btn px-3 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white font-bold text-xs flex items-center space-x-1.5 border border-cardBorder">
              <span>LINK</span>
            </button>
            
            <!-- Custom Symbol Input -->
            <div class="flex items-center space-x-1 ml-auto">
              <input type="text" id="customCryptoInput" placeholder="Ex: SUI, NEAR, PEPE" class="w-32 bg-slate-900 border border-cardBorder rounded-lg px-2.5 py-1 text-white mono text-xs uppercase">
              <button onclick="loadCustomCrypto()" class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-binance font-bold text-xs border border-cardBorder">
                Carregar
              </button>
            </div>
          </div>'''

assert target_pills in text, "target_pills not found"
text = text.replace(target_pills, replacement_pills)

# Also make the orderSymbol in the form editable:
target_readonly = '<input type="text" id="orderSymbol" value="BTCUSDT" readonly class="w-full bg-slate-900 border border-cardBorder rounded-lg px-3 py-2 text-white mono font-bold">'
replacement_readonly = '<input type="text" id="orderSymbol" value="BTCUSDT" onchange="selectCrypto(this.value)" class="w-full bg-slate-900 border border-cardBorder rounded-lg px-3 py-2 text-white mono font-bold uppercase">'
text = text.replace(target_readonly, replacement_readonly)

with open(path, "wb") as f:
    f.write(text.encode("utf-8"))

print("Updated frontend/index.html successfully")
