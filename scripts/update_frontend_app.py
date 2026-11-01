import os

path = os.path.join("frontend", "app.js")
with open(path, "rb") as f:
    text = f.read().decode("utf-8").replace("\r\n", "\n")

target_cfg = '''// Load Configuration Form
async function loadConfigForm() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();

    document.getElementById('cfgBinanceLive').checked = !!cfg.binance_live;
    document.getElementById('cfgApiKey').value = cfg.binance_api_key || '';
    document.getElementById('cfgApiSecret').value = cfg.binance_api_secret || '';
    document.getElementById('cfgTestnet').checked = !!cfg.binance_testnet;
    document.getElementById('cfgBudget').value = cfg.budget || 100.0;
    document.getElementById('cfgMaxOrder').value = cfg.max_order_usd || 25.0;
    document.getElementById('cfgCashBuffer').value = cfg.cash_buffer_pct || 15;
    document.getElementById('cfgMaxPosition').value = cfg.max_position_pct || 30;
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

// Save Settings
async function saveSettings() {
  const payload = {
    binance_live: document.getElementById('cfgBinanceLive').checked,
    binance_api_key: document.getElementById('cfgApiKey').value.trim(),
    binance_api_secret: document.getElementById('cfgApiSecret').value.trim(),
    binance_testnet: document.getElementById('cfgTestnet').checked,
    budget: parseFloat(document.getElementById('cfgBudget').value) || 100.0,
    max_order_usd: parseFloat(document.getElementById('cfgMaxOrder').value) || 25.0,
    cash_buffer_pct: parseFloat(document.getElementById('cfgCashBuffer').value) || 15,
    max_position_pct: parseFloat(document.getElementById('cfgMaxPosition').value) || 30,
    paper: !document.getElementById('cfgBinanceLive').checked
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('Configurações salvas com sucesso!');
      loadPortfolio();
    } else {
      showToast('Falha ao salvar configurações', false);
    }
  } catch (err) {
    showToast('Erro ao salvar', false);
  }
}'''

replacement_cfg = '''// Load Configuration Form
async function loadConfigForm() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();

    document.getElementById('cfgBinanceLive').checked = !!cfg.binance_live;
    document.getElementById('cfgApiKey').value = cfg.binance_api_key || '';
    document.getElementById('cfgApiSecret').value = cfg.binance_api_secret || '';
    document.getElementById('cfgTestnet').checked = !!cfg.binance_testnet;
    
    // Alpaca
    if (document.getElementById('cfgAlpacaKey')) {
      document.getElementById('cfgAlpacaKey').value = cfg.alpaca_api_key || '';
      document.getElementById('cfgAlpacaSecret').value = cfg.alpaca_api_secret || '';
      document.getElementById('cfgAlpacaPaper').checked = cfg.alpaca_paper !== false;
    }

    // MT5
    if (document.getElementById('cfgMt5Enabled')) {
      document.getElementById('cfgMt5Enabled').checked = cfg.mt5_enabled !== false;
    }

    document.getElementById('cfgBudget').value = cfg.budget || 100.0;
    document.getElementById('cfgMaxOrder').value = cfg.max_order_usd || 25.0;
    document.getElementById('cfgCashBuffer').value = cfg.cash_buffer_pct || 15;
    document.getElementById('cfgMaxPosition').value = cfg.max_position_pct || 30;
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

// Save Settings
async function saveSettings() {
  const payload = {
    binance_live: document.getElementById('cfgBinanceLive').checked,
    binance_api_key: document.getElementById('cfgApiKey').value.trim(),
    binance_api_secret: document.getElementById('cfgApiSecret').value.trim(),
    binance_testnet: document.getElementById('cfgTestnet').checked,
    alpaca_api_key: document.getElementById('cfgAlpacaKey') ? document.getElementById('cfgAlpacaKey').value.trim() : '',
    alpaca_api_secret: document.getElementById('cfgAlpacaSecret') ? document.getElementById('cfgAlpacaSecret').value.trim() : '',
    alpaca_paper: document.getElementById('cfgAlpacaPaper') ? document.getElementById('cfgAlpacaPaper').checked : true,
    mt5_enabled: document.getElementById('cfgMt5Enabled') ? document.getElementById('cfgMt5Enabled').checked : true,
    budget: parseFloat(document.getElementById('cfgBudget').value) || 100.0,
    max_order_usd: parseFloat(document.getElementById('cfgMaxOrder').value) || 25.0,
    cash_buffer_pct: parseFloat(document.getElementById('cfgCashBuffer').value) || 15,
    max_position_pct: parseFloat(document.getElementById('cfgMaxPosition').value) || 30,
    paper: !document.getElementById('cfgBinanceLive').checked
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('Todas as configurações foram salvas com sucesso!');
      loadPortfolio();
    } else {
      showToast('Falha ao salvar configurações', false);
    }
  } catch (err) {
    showToast('Erro ao salvar', false);
  }
}'''

assert target_cfg in text, "target_cfg not found"
text = text.replace(target_cfg, replacement_cfg)

# Also update loadPortfolio to update mt5StatusBadge and alpacaStatusBadge
target_port = '''    const isLive = b.mode === 'live';
    modeBadge.innerText = isLive ? 'SPOT LIVE' : 'SIMULAÇÃO / PAPER';'''

replacement_port = '''    const isLive = b.mode === 'live';
    modeBadge.innerText = isLive ? 'SPOT LIVE' : 'SIMULAÇÃO / PAPER';

    // Update MT5 and Alpaca badges
    const mt5Badge = document.getElementById('mt5StatusBadge');
    if (mt5Badge && data.b3_mt5) {
      const isMt5Live = data.b3_mt5.connected;
      mt5Badge.innerText = isMt5Live ? 'MT5 CONECTADO' : 'MT5 SIMULAÇÃO ATIVA';
      mt5Badge.className = `text-xs px-2.5 py-0.5 rounded-full ${isMt5Live ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'}`;
    }

    const alpacaBadge = document.getElementById('alpacaStatusBadge');
    if (alpacaBadge && data.alpaca) {
      const hasAlpacaKeys = data.alpaca.mode !== 'simulation_local';
      alpacaBadge.innerText = hasAlpacaKeys ? (data.alpaca.mode === 'alpaca_live' ? 'ALPACA LIVE' : 'ALPACA PAPER') : 'ALPACA SIMULAÇÃO';
      alpacaBadge.className = `text-xs px-2.5 py-0.5 rounded-full ${hasAlpacaKeys ? 'bg-binance/20 text-binance border border-binance/30' : 'bg-slate-800 text-slate-400'}`;
    }'''

assert target_port in text, "target_port not found"
text = text.replace(target_port, replacement_port)

with open(path, "wb") as f:
    f.write(text.encode("utf-8"))

print("Updated frontend/app.js successfully")
