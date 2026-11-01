// Trader Skill Dashboard - Frontend Logic
let currentSymbol = 'BTCUSDT';
let currentInterval = '1h';
let currentChartType = 'candles'; // 'candles' ou 'line'
let currentSide = 'BUY';
let allRecommendations = [];
let allTickets = [];
let activeTab = 'recs';

// Filtros Ativos
let currentRecMarketFilter = 'ALL';
let currentRecActionFilter = 'ALL'; // 'ALL', 'BUY', 'SELL'
let currentTicketStatusFilter = 'ALL';
let currentTicketSideFilter = 'ALL'; // 'ALL', 'BUY', 'SELL'

// Instâncias do TradingView Lightweight Charts (Gráfico Principal)
let lwChart = null;
let lwCandleSeries = null;
let lwLineSeries = null;
let lwSmaSeries = null;
let lwVolumeSeries = null;
let cachedCandlesData = [];

// Instâncias do TradingView Lightweight Charts (Modal de Gráficos)
let modalLwChart = null;
let modalCandleSeries = null;
let modalLineSeries = null;
let modalSmaSeries = null;
let modalVolumeSeries = null;
let modalCurrentSymbol = '';
let modalCurrentMarket = '';
let modalCurrentInterval = '1h';
let modalCurrentChartType = 'candles';
let modalCachedCandlesData = [];

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  initChart();
  refreshData();
  loadAutoTradingStatus();
  // Poll market quotes & auto-trader status every 10 seconds
  setInterval(() => {
    fetchMarketQuotes();
    loadPortfolio();
    loadAutoTradingStatus();
  }, 10000);
});

// Toast notification
function showToast(msg, isSuccess = true) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastIcon = document.getElementById('toastIcon');

  toastMsg.innerText = msg;
  if (isSuccess) {
    toastIcon.className = "ph-bold ph-check-circle text-accentGreen text-base";
    toast.className = toast.className.replace('border-accentRed', 'border-accentGreen');
  } else {
    toastIcon.className = "ph-bold ph-warning-circle text-accentRed text-base";
    toast.className = toast.className.replace('border-accentGreen', 'border-accentRed');
  }

  toast.classList.remove('translate-y-20', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
  }, 4000);
}

// Tab Switching
function switchTab(tabId) {
  activeTab = tabId;
  const tabs = ['recs', 'crypto', 'b3', 'us', 'trades', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    const btn = document.getElementById(`tabBtn-${t}`);
    if (el) {
      if (t === tabId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabId) {
        btn.classList.add('border-binance', 'text-binance');
        btn.classList.remove('border-transparent', 'text-slate-400');
      } else {
        btn.classList.remove('border-binance', 'text-binance');
        btn.classList.add('border-transparent', 'text-slate-400');
      }
    }
  });

  if (tabId === 'crypto') {
    setTimeout(() => {
      const container = document.getElementById('cryptoChartContainer');
      if (!lwChart) {
        initChart();
      } else if (container) {
        lwChart.applyOptions({ width: container.clientWidth || 600 });
      }
      loadChart(currentSymbol, currentInterval);
      loadOrderBook(currentSymbol);
    }, 50);
  } else if (tabId === 'trades') {
    loadTickets();
  } else if (tabId === 'settings') {
    loadConfigForm();
  }
}

// Refresh all data
async function refreshData() {
  await fetchMarketQuotes();
  await loadPortfolio();
  await loadRecommendations();
  await loadTickets();
  if (activeTab === 'crypto') {
    await loadChart(currentSymbol, currentInterval);
    await loadOrderBook(currentSymbol);
  }
}

// Fetch Market Quotes (Binance, US, B3)
async function fetchMarketQuotes() {
  try {
    const res = await fetch('/api/market/quotes');
    if (!res.ok) return;
    const data = await res.json();

    // Render Ticker Tape
    renderTickerTape(data);

    // Render B3 Table
    renderStockTable('b3TableBody', data.b3 || [], 'B3');

    // Render US Table
    renderStockTable('usTableBody', data.us || [], 'US');

    // Update Quick Symbol price if current selected
    if (data.crypto) {
      const match = data.crypto.find(c => c.symbol === currentSymbol);
      if (match) {
        document.getElementById('chartPrice').innerText = `$${match.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        const changeEl = document.getElementById('chartChange');
        const change = match.change_24h_pct;
        changeEl.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        changeEl.className = `text-xs px-2 py-0.5 rounded font-semibold ${change >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`;
      }
    }
  } catch (err) {
    console.error('Erro ao buscar cotações:', err);
  }
}

// Render Ticker Tape
function renderTickerTape(data) {
  const container = document.getElementById('tickerTape');
  let items = [];

  // Binance Cryptos
  (data.crypto || []).forEach(c => {
    const isUp = c.change_24h_pct >= 0;
    items.push(`
      <div class="inline-flex items-center space-x-1.5 cursor-pointer hover:text-white" onclick="selectCrypto('${c.symbol}')">
        <span class="font-bold text-slate-300">${c.asset}</span>
        <span class="text-white">$${c.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        <span class="${isUp ? 'text-emerald-400' : 'text-rose-400'}">${isUp ? '+' : ''}${c.change_24h_pct.toFixed(2)}%</span>
      </div>
    `);
  });

  // Top B3
  (data.b3 || []).slice(0, 3).forEach(b => {
    const isUp = b.change_24h_pct >= 0;
    items.push(`
      <div class="inline-flex items-center space-x-1.5 cursor-pointer hover:text-white">
        <span class="font-bold text-slate-400">${b.symbol}</span>
        <span class="text-white">R$${b.price.toFixed(2)}</span>
        <span class="${isUp ? 'text-emerald-400' : 'text-rose-400'}">${isUp ? '+' : ''}${b.change_24h_pct.toFixed(2)}%</span>
      </div>
    `);
  });

  // Top US
  (data.us || []).slice(0, 3).forEach(u => {
    const isUp = u.change_24h_pct >= 0;
    items.push(`
      <div class="inline-flex items-center space-x-1.5 cursor-pointer hover:text-white">
        <span class="font-bold text-slate-400">${u.symbol}</span>
        <span class="text-white">$${u.price.toFixed(2)}</span>
        <span class="${isUp ? 'text-emerald-400' : 'text-rose-400'}">${isUp ? '+' : ''}${u.change_24h_pct.toFixed(2)}%</span>
      </div>
    `);
  });

  container.innerHTML = items.join('<span class="text-slate-700">•</span>');
}

// Render Stocks Tables (B3 and US)
function renderStockTable(tbodyId, items, market) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Nenhum ativo disponível</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(item => {
    const isUp = item.change_24h_pct >= 0;
    const curr = item.currency === 'BRL' ? 'R$' : '$';
    return `
      <tr class="hover:bg-slate-900/50 transition">
        <td class="p-4 font-bold text-white flex items-center space-x-2">
          <span>${item.symbol}</span>
          <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-normal">${item.market}</span>
        </td>
        <td class="p-4 font-bold text-white">${curr}${item.price.toFixed(2)}</td>
        <td class="p-4">
          <span class="px-2 py-0.5 rounded font-semibold ${isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}">
            ${isUp ? '+' : ''}${item.change_24h_pct.toFixed(2)}%
          </span>
        </td>
        <td class="p-4 text-slate-400">${curr}${item.high_24h.toFixed(2)} / ${curr}${item.low_24h.toFixed(2)}</td>
        <td class="p-4 text-slate-400">${(item.volume || 0).toLocaleString()}</td>
        <td class="p-4 text-right space-x-1.5 whitespace-nowrap">
          <button onclick="openChartModal('${item.symbol}', '${market}', ${item.price})" class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-binance border border-binance/30 font-semibold text-xs transition" title="Visualizar gráfico de velas">
            <i class="ph-bold ph-chart-line-up mr-0.5"></i>Gráfico
          </button>
          <button onclick="proposeQuickTrade('${item.symbol}', '${market}', ${item.price})" class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition">
            Operar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Load Recommendations
async function loadRecommendations() {
  try {
    const res = await fetch('/api/recommendations');
    if (!res.ok) return;
    const data = await res.json();
    allRecommendations = data.recommendations || [];
    document.getElementById('recsCountBadge').innerText = allRecommendations.length;

    // Atualiza contadores dinâmicos nos botões de filtro BUY e SELL
    const buyCount = allRecommendations.filter(r => r.action === 'BUY').length;
    const sellCount = allRecommendations.filter(r => r.action === 'SELL').length;
    const totalCount = allRecommendations.length;

    const bTotal = document.getElementById('badgeRecTotal');
    const bBuy = document.getElementById('badgeRecBuy');
    const bSell = document.getElementById('badgeRecSell');

    if (bTotal) bTotal.innerText = totalCount;
    if (bBuy) bBuy.innerText = buyCount;
    if (bSell) bSell.innerText = sellCount;

    applyCombinedRecsFilter();
  } catch (err) {
    console.error('Erro ao carregar recomendações:', err);
  }
}

// Filtro de Mercado (Todos, Binance, B3, US)
function setRecMarketFilter(market) {
  currentRecMarketFilter = market;
  document.querySelectorAll('.rec-market-btn').forEach(b => {
    b.className = "rec-market-btn px-3 py-1.5 rounded text-slate-400 hover:text-white font-medium transition";
  });
  const activeBtn = document.getElementById(`recMarketBtn-${market}`);
  if (activeBtn) {
    activeBtn.className = "rec-market-btn px-3 py-1.5 rounded bg-slate-800 text-white font-medium transition";
  }
  applyCombinedRecsFilter();
}

// Filtro Ativo BUY / SELL
function setRecActionFilter(action) {
  currentRecActionFilter = action;
  const btnAll = document.getElementById('recActionBtn-ALL');
  const btnBuy = document.getElementById('recActionBtn-BUY');
  const btnSell = document.getElementById('recActionBtn-SELL');

  if (btnAll) btnAll.className = "rec-action-btn px-3 py-1.5 rounded text-slate-400 hover:text-white font-semibold transition flex items-center gap-1.5";
  if (btnBuy) btnBuy.className = "rec-action-btn px-3 py-1.5 rounded text-slate-400 hover:text-emerald-400 font-semibold transition flex items-center gap-1.5";
  if (btnSell) btnSell.className = "rec-action-btn px-3 py-1.5 rounded text-slate-400 hover:text-rose-400 font-semibold transition flex items-center gap-1.5";

  if (action === 'ALL' && btnAll) {
    btnAll.className = "rec-action-btn px-3 py-1.5 rounded bg-binance text-slate-950 font-bold transition flex items-center gap-1.5";
  } else if (action === 'BUY' && btnBuy) {
    btnBuy.className = "rec-action-btn px-3 py-1.5 rounded bg-accentGreen text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-500/20";
  } else if (action === 'SELL' && btnSell) {
    btnSell.className = "rec-action-btn px-3 py-1.5 rounded bg-accentRed text-white font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-500/20";
  }

  applyCombinedRecsFilter();
}

// Aplicação Combinada de Filtros
function applyCombinedRecsFilter() {
  let filtered = allRecommendations;

  // 1. Filtro por mercado
  if (currentRecMarketFilter !== 'ALL') {
    filtered = filtered.filter(r => r.market.toLowerCase() === currentRecMarketFilter.toLowerCase());
  }

  // 2. Filtro ativo por ação (BUY ou SELL)
  if (currentRecActionFilter === 'BUY') {
    filtered = filtered.filter(r => r.action === 'BUY');
  } else if (currentRecActionFilter === 'SELL') {
    filtered = filtered.filter(r => r.action === 'SELL');
  }

  renderRecommendations(filtered);
}

// Retrocompatibilidade
function filterRecs(market) {
  setRecMarketFilter(market);
}

// Render Recommendations Cards
function renderRecommendations(recs) {
  const container = document.getElementById('recommendationsGrid');
  if (!container) return;

  if (recs.length === 0) {
    container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-500">Nenhuma recomendação no momento para este filtro.</div>`;
    return;
  }

  container.innerHTML = recs.map(r => {
    const isBuy = r.action === 'BUY';
    const isSell = r.action === 'SELL';
    const isStrong = r.signal.includes('STRONG');
    const badgeColor = isBuy ? (isStrong ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-emerald-500/10 text-emerald-400') :
                       isSell ? (isStrong ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-rose-500/10 text-rose-400') :
                       'bg-slate-800 text-slate-300';
    
    const curr = r.market === 'B3' ? 'R$' : '$';

    return `
      <div class="bg-cardBg border border-cardBorder rounded-xl p-5 hover:border-slate-700 transition flex flex-col justify-between space-y-4 shadow-xl">
        <div>
          <!-- Header -->
          <div class="flex items-center justify-between mb-3">
            <div>
              <div class="flex items-center space-x-2">
                <span class="text-base font-bold text-white mono">${r.symbol}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-cardBorder">${r.market}</span>
              </div>
              <div class="text-xs text-slate-400 mt-0.5 mono">Preço Atual: <strong class="text-white">${curr}${r.current_price.toLocaleString()}</strong></div>
            </div>
            <span class="text-xs px-2.5 py-1 rounded-full font-bold ${badgeColor}">
              ${r.signal}
            </span>
          </div>

          <!-- Rationale -->
          <div class="bg-darkBg/60 rounded-lg p-3 text-xs text-slate-300 mb-3 border border-cardBorder/60 leading-relaxed">
            <span class="text-[10px] font-bold text-binance uppercase tracking-wider block mb-1">Fundamento Técnico:</span>
            ${r.rationale}
          </div>

          <!-- Indicators & Risk/Reward Targets -->
          <div class="grid grid-cols-3 gap-2 text-center text-xs mono mb-2">
            <div class="bg-slate-900/60 p-2 rounded-lg border border-cardBorder">
              <span class="text-[10px] text-slate-500 block">RSI (14)</span>
              <span class="font-bold ${r.indicators.rsi_14 < 30 ? 'text-emerald-400' : r.indicators.rsi_14 > 70 ? 'text-rose-400' : 'text-slate-300'}">${r.indicators.rsi_14}</span>
            </div>
            <div class="bg-slate-900/60 p-2 rounded-lg border border-cardBorder">
              <span class="text-[10px] text-slate-500 block">STOP LOSS</span>
              <span class="font-bold text-rose-400">${curr}${r.stop_loss.toLocaleString()}</span>
            </div>
            <div class="bg-slate-900/60 p-2 rounded-lg border border-cardBorder">
              <span class="text-[10px] text-slate-500 block">ALVO TP1</span>
              <span class="font-bold text-emerald-400">${curr}${r.take_profit_1.toLocaleString()}</span>
            </div>
          </div>
          <div class="flex justify-between items-center text-[11px] text-slate-400 px-1 mono">
            <span>Relação R:R: <strong class="text-white">${r.risk_reward_ratio}</strong></span>
            <span>Confiança: <strong class="text-binance">${r.confidence}%</strong></span>
          </div>
        </div>

        <!-- Action Buttons: Ver Gráfico de Candles + Gerar Ticket -->
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button onclick="openChartModal('${r.symbol}', '${r.market}', ${r.current_price})" class="py-2.5 rounded-lg font-bold text-xs bg-slate-800 hover:bg-slate-700 text-binance border border-binance/30 transition flex items-center justify-center space-x-1.5 shadow" title="Visualizar gráfico de candles (velas)">
            <i class="ph-bold ph-chart-line-up text-sm"></i>
            <span>Ver Gráfico</span>
          </button>
          <button onclick="proposeTradeFromRec('${r.symbol}', '${r.action}', '${r.market}', ${r.entry_price}, ${r.stop_loss}, ${r.take_profit_1}, '${encodeURIComponent(r.rationale)}')" class="py-2.5 rounded-lg font-bold text-xs ${isBuy ? 'bg-accentGreen hover:bg-emerald-600' : 'bg-slate-800 hover:bg-slate-700'} text-white shadow transition flex items-center justify-center space-x-1.5">
            <i class="ph-bold ph-receipt text-sm"></i>
            <span>Gerar Ordem</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// Propose trade from recommendation
function proposeTradeFromRec(symbol, side, market, price, sl, tp, encodedRationale) {
  const rationale = decodeURIComponent(encodedRationale);
  if (market === 'Binance') {
    selectCrypto(symbol);
    setOrderSide(side);
    document.getElementById('orderSL').value = sl;
    document.getElementById('orderTP').value = tp;
    switchTab('crypto');
  } else {
    // Open modal directly with prefilled proposal
    createAndInspectProposal(symbol, side, market, 25.0, price, sl, tp, rationale);
  }
}

// Quick Trade proposal from B3/US tables
function proposeQuickTrade(symbol, market, price) {
  createAndInspectProposal(symbol, 'BUY', market, 25.0, price, price * 0.95, price * 1.08, 'Ordem manual criada pelo painel de mercado.');
}

// Create and Inspect Proposal
async function createAndInspectProposal(symbol, side, market, notional, limitPrice, sl, tp, rationale) {
  try {
    const res = await fetch('/api/trades/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        side,
        market,
        notional,
        limit_price: limitPrice,
        stop_loss: sl,
        take_profit: tp,
        rationale
      })
    });
    const ticket = await res.json();
    if (!res.ok) {
      showToast(ticket.detail || 'Erro ao validar proposta', false);
      return;
    }
    openApprovalModal(ticket);
    loadTickets();
  } catch (err) {
    showToast('Falha na comunicação com o backend', false);
  }
}

// Submit Order Proposal from Crypto Form
async function submitOrderProposal() {
  const symbol = document.getElementById('orderSymbol').value;
  const side = currentSide;
  const orderType = document.getElementById('orderType').value;
  const notional = parseFloat(document.getElementById('orderNotional').value) || 15.0;
  const limitPrice = orderType === 'LIMIT' ? parseFloat(document.getElementById('orderPrice').value) : null;
  const sl = parseFloat(document.getElementById('orderSL').value) || null;
  const tp = parseFloat(document.getElementById('orderTP').value) || null;

  try {
    const res = await fetch('/api/trades/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        side,
        market: 'Binance',
        order_type: orderType,
        notional,
        limit_price: limitPrice,
        stop_loss: sl,
        take_profit: tp,
        rationale: `Ordem ${side} gerada na boleta Binance para valor de $${notional.toFixed(2)}`
      })
    });

    const ticket = await res.json();
    if (!res.ok) {
      showToast(ticket.detail || 'Erro na verificação de risco', false);
      return;
    }

    openApprovalModal(ticket);
    loadTickets();
  } catch (err) {
    showToast('Erro ao enviar ordem', false);
  }
}

// Open Approval Modal
function openApprovalModal(ticket) {
  const modal = document.getElementById('approvalModal');
  const content = document.getElementById('modalTicketContent');
  const btn = document.getElementById('modalApproveBtn');

  const isReady = ticket.status === 'READY';
  const isBlock = ticket.verdict === 'BLOCK';

  content.innerHTML = `
    <div class="bg-darkBg p-3.5 rounded-xl border border-cardBorder space-y-2">
      <div class="flex justify-between items-center">
        <span class="text-slate-400">ID da Ordem:</span>
        <span class="font-bold text-white">${ticket.id}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-slate-400">Ativo / Par:</span>
        <span class="font-bold text-binance text-sm">${ticket.symbol} (${ticket.market})</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-slate-400">Operação:</span>
        <span class="font-bold ${ticket.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}">${ticket.side} ${ticket.order_type}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-slate-400">Valor Proposto:</span>
        <span class="font-bold text-white">$${(ticket.notional || 0).toFixed(2)} USD</span>
      </div>
      ${ticket.price ? `<div class="flex justify-between items-center"><span class="text-slate-400">Preço Ref:</span><span class="font-bold text-white">$${ticket.price.toFixed(2)}</span></div>` : ''}
      ${ticket.stop_loss ? `<div class="flex justify-between items-center"><span class="text-slate-400">Stop Loss:</span><span class="font-bold text-rose-400">$${ticket.stop_loss.toFixed(2)}</span></div>` : ''}
      ${ticket.take_profit ? `<div class="flex justify-between items-center"><span class="text-slate-400">Take Profit:</span><span class="font-bold text-emerald-400">$${ticket.take_profit.toFixed(2)}</span></div>` : ''}
    </div>

    <!-- Risk Verdict -->
    <div class="p-3 rounded-xl border ${isReady ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}">
      <div class="font-bold text-xs uppercase flex items-center gap-1.5 mb-1">
        <i class="ph-bold ${isReady ? 'ph-check-circle' : 'ph-x-circle'}"></i>
        <span>Veredito de Risco: ${ticket.verdict}</span>
      </div>
      <div class="text-[11px] text-slate-300">
        ${ticket.reasons && ticket.reasons.length > 0 ? ticket.reasons.join('<br>') : 'Aprovado em todas as checagens de risco (orçamento, caixa e whitelist).'}
      </div>
    </div>
  `;

  if (isReady) {
    btn.disabled = false;
    btn.className = "px-5 py-2.5 rounded-lg bg-accentGreen hover:bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20";
    btn.innerHTML = `<i class="ph-bold ph-check mr-1"></i> Confirmar e Executar Ordem (Yes)`;
    btn.onclick = async () => {
      await approveAndExecute(ticket.id);
      closeModal();
    };
  } else {
    btn.disabled = true;
    btn.className = "px-5 py-2.5 rounded-lg bg-slate-800 text-slate-500 text-xs font-bold cursor-not-allowed";
    btn.innerHTML = `Bloqueado pelo Gerenciador de Risco`;
  }

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('approvalModal').classList.add('hidden');
}

// Approve and Execute flow
async function approveAndExecute(ticketId) {
  try {
    // 1. Approve
    const appRes = await fetch(`/api/trades/${ticketId}/approve`, { method: 'POST' });
    if (!appRes.ok) {
      showToast('Falha na aprovação da ordem', false);
      return;
    }

    // 2. Execute
    const execRes = await fetch(`/api/trades/${ticketId}/execute`, { method: 'POST' });
    const execData = await execRes.json();
    if (!execRes.ok) {
      showToast(execData.detail || 'Erro na execução da ordem', false);
      return;
    }

    showToast(`Ordem ${ticketId} executada com sucesso!`);
    loadTickets();
    loadPortfolio();
  } catch (err) {
    showToast('Erro ao processar execução', false);
  }
}

// Load Tickets
async function loadTickets() {
  try {
    const res = await fetch('/api/trades/tickets');
    if (!res.ok) return;
    const data = await res.json();
    allTickets = data.tickets || [];
    const readyCount = allTickets.filter(t => t.status === 'READY').length;
    document.getElementById('pendingTradesBadge').innerText = readyCount;
    applyCombinedTicketsFilter();
  } catch (err) {
    console.error('Erro ao carregar tickets:', err);
  }
}

// Filtro por Status do Ticket
function setTicketStatusFilter(status) {
  currentTicketStatusFilter = status;
  document.querySelectorAll('.ticket-status-btn').forEach(b => {
    b.className = "ticket-status-btn px-3 py-1 rounded text-slate-400 hover:text-white font-medium transition";
  });
  const activeBtn = document.getElementById(`ticketStatusBtn-${status}`);
  if (activeBtn) {
    activeBtn.className = "ticket-status-btn px-3 py-1 rounded bg-slate-800 text-white font-medium transition";
  }
  applyCombinedTicketsFilter();
}

// Filtro Ativo BUY / SELL para Tickets
function setTicketSideFilter(side) {
  currentTicketSideFilter = side;
  const btnAll = document.getElementById('ticketSideBtn-ALL');
  const btnBuy = document.getElementById('ticketSideBtn-BUY');
  const btnSell = document.getElementById('ticketSideBtn-SELL');

  if (btnAll) btnAll.className = "ticket-side-btn px-2.5 py-1 rounded text-slate-400 hover:text-white font-semibold transition";
  if (btnBuy) btnBuy.className = "ticket-side-btn px-2.5 py-1 rounded text-slate-400 hover:text-emerald-400 font-semibold transition flex items-center gap-1";
  if (btnSell) btnSell.className = "ticket-side-btn px-2.5 py-1 rounded text-slate-400 hover:text-rose-400 font-semibold transition flex items-center gap-1";

  if (side === 'ALL' && btnAll) {
    btnAll.className = "ticket-side-btn px-2.5 py-1 rounded bg-binance text-slate-950 font-bold transition";
  } else if (side === 'BUY' && btnBuy) {
    btnBuy.className = "ticket-side-btn px-2.5 py-1 rounded bg-accentGreen text-white font-bold transition flex items-center gap-1 shadow-md shadow-emerald-500/20";
  } else if (side === 'SELL' && btnSell) {
    btnSell.className = "ticket-side-btn px-2.5 py-1 rounded bg-accentRed text-white font-bold transition flex items-center gap-1 shadow-md shadow-rose-500/20";
  }

  applyCombinedTicketsFilter();
}

// Aplicação Combinada de Filtros em Tickets
function applyCombinedTicketsFilter() {
  let filtered = allTickets;

  if (currentTicketStatusFilter !== 'ALL') {
    filtered = filtered.filter(t => t.status === currentTicketStatusFilter);
  }

  if (currentTicketSideFilter !== 'ALL') {
    filtered = filtered.filter(t => t.side.toUpperCase() === currentTicketSideFilter.toUpperCase());
  }

  renderTickets(filtered);
}

// Retrocompatibilidade
function filterTickets(status) {
  setTicketStatusFilter(status);
}

// Render Tickets
function renderTickets(tickets) {
  const container = document.getElementById('ticketsContainer');
  if (!container) return;

  if (tickets.length === 0) {
    container.innerHTML = `<div class="bg-cardBg border border-cardBorder rounded-xl p-8 text-center text-slate-500">Nenhum ticket encontrado.</div>`;
    return;
  }

  container.innerHTML = tickets.map(t => {
    const isReady = t.status === 'READY';
    const isApproved = t.status === 'APPROVED';
    const isExecuted = t.status === 'EXECUTED';
    const isCancelled = t.status === 'CANCELLED';

    const statusBadge = isExecuted ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                        isReady ? 'bg-binance/20 text-binance border border-binance/30' :
                        isCancelled ? 'bg-slate-800 text-slate-500' : 'bg-rose-500/20 text-rose-400';

    return `
      <div class="bg-cardBg border border-cardBorder rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 mono text-xs shadow-lg">
        <div class="space-y-1">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-white">${t.id}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${statusBadge}">${t.status}</span>
            <span class="text-slate-500 text-[10px]">${t.created_at.slice(0, 19).replace('T', ' ')}</span>
          </div>
          <div class="text-slate-300">
            <strong class="${t.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}">${t.side}</strong>
            <span class="text-white font-bold ml-1">${t.symbol}</span>
            <span class="text-slate-400 ml-1">(${t.market})</span> •
            <span class="text-white ml-1">$${(t.notional || 0).toFixed(2)} USD</span>
          </div>
          ${t.reasons && t.reasons.length > 0 ? `<div class="text-slate-500 text-[10px]">${t.reasons[0]}</div>` : ''}
        </div>

        <div class="flex items-center space-x-2">
          <button onclick="openChartModal('${t.symbol}', '${t.market}', ${t.price || 0})" class="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-binance border border-binance/30 font-semibold text-xs transition" title="Visualizar gráfico de candles desta operação">
            <i class="ph-bold ph-chart-line-up mr-1"></i>Gráfico
          </button>
          ${isReady ? `
            <button onclick="approveAndExecute('${t.id}')" class="px-4 py-2 rounded-lg bg-accentGreen hover:bg-emerald-600 text-white font-bold transition">
              Aprovar & Executar
            </button>
            <button onclick="cancelTicket('${t.id}')" class="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 font-semibold transition">
              Cancelar
            </button>
          ` : isExecuted ? `
            <span class="text-emerald-400 font-semibold flex items-center gap-1">
              <i class="ph-bold ph-check"></i> Executado na ${t.market}
            </span>
          ` : `
            <span class="text-slate-500">${t.status}</span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

async function cancelTicket(ticketId) {
  try {
    const res = await fetch(`/api/trades/${ticketId}/cancel`, { method: 'POST' });
    if (res.ok) {
      showToast('Ordem cancelada.');
      loadTickets();
    }
  } catch (err) {
    showToast('Erro ao cancelar ordem', false);
  }
}

// Load Portfolio & Balances
async function loadPortfolio() {
  try {
    const res = await fetch('/api/portfolio');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('statBudget').innerText = `$${(data.budget || 100).toFixed(2)}`;
    document.getElementById('statTradesCount').innerText = data.executed_trades_count || 0;

    const b = data.binance || {};
    const usdtBalance = (b.balances || []).find(x => x.asset === 'USDT');
    const freeUsdt = usdtBalance ? usdtBalance.free : 0.0;

    document.getElementById('statUsdtBalance').innerText = `$${freeUsdt.toFixed(2)}`;
    document.getElementById('quickBalanceHint').innerText = `Saldo Disp: $${freeUsdt.toFixed(2)}`;

    const walletList = document.getElementById('walletBalancesList');
    const modeBadge = document.getElementById('walletModeBadge');

    const isLive = b.mode === 'live';
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
    }
    modeBadge.className = `text-[10px] px-2 py-0.5 rounded font-semibold ${isLive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-300'}`;

    if (b.balances && b.balances.length > 0) {
      walletList.innerHTML = b.balances.map(item => `
        <div class="flex justify-between items-center py-1 border-b border-cardBorder/40">
          <span class="text-slate-400 font-bold">${item.asset}</span>
          <span class="text-white">${item.free.toLocaleString()}</span>
        </div>
      `).join('');
    } else {
      walletList.innerHTML = `<div class="text-slate-500">Nenhum saldo encontrado</div>`;
    }
  } catch (err) {
    console.error('Erro ao consultar carteira:', err);
  }
}

// ==================== TRADINGVIEW LIGHTWEIGHT CHARTS (CANDLESTICKS) ====================
function initChart() {
  const container = document.getElementById('cryptoChartContainer');
  if (!container || !window.LightweightCharts) return;

  if (lwChart) {
    try { lwChart.remove(); } catch (e) {}
    lwChart = null;
  }
  container.innerHTML = '';

  lwChart = LightweightCharts.createChart(container, {
    width: container.clientWidth || 600,
    height: container.clientHeight || 380,
    layout: {
      background: { type: 'solid', color: '#090d16' },
      textColor: '#94a3b8',
      fontSize: 11,
      fontFamily: 'ui-monospace, monospace'
    },
    grid: {
      vertLines: { color: '#182032' },
      horzLines: { color: '#182032' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: '#F3BA2F', width: 1, style: 2 },
      horzLine: { color: '#F3BA2F', width: 1, style: 2 },
    },
    rightPriceScale: {
      borderColor: '#1e293b',
      textColor: '#94a3b8',
    },
    timeScale: {
      borderColor: '#1e293b',
      timeVisible: true,
      secondsVisible: false,
    },
  });

  // 1. Candlestick series
  lwCandleSeries = lwChart.addCandlestickSeries({
    upColor: '#0ECB81',
    downColor: '#F6465D',
    borderVisible: false,
    wickUpColor: '#0ECB81',
    wickDownColor: '#F6465D',
  });

  // 2. Line series
  lwLineSeries = lwChart.addLineSeries({
    color: '#F3BA2F',
    lineWidth: 2,
    visible: false,
  });

  // 3. SMA 20 Overlay
  lwSmaSeries = lwChart.addLineSeries({
    color: '#06B6D4',
    lineWidth: 1.5,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    priceLineVisible: false,
    title: 'SMA 20',
  });

  // 4. Volume histogram
  lwVolumeSeries = lwChart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  });
  lwVolumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.82, bottom: 0 },
  });

  // Crosshair hover info
  lwChart.subscribeCrosshairMove(param => {
    const ohlcEl = document.getElementById('chartOHLC');
    if (!ohlcEl) return;
    if (!param || !param.time || !param.seriesData) return;
    const cData = param.seriesData.get(lwCandleSeries) || param.seriesData.get(lwLineSeries);
    if (cData) {
      const o = cData.open !== undefined ? cData.open.toFixed(2) : '--';
      const h = cData.high !== undefined ? cData.high.toFixed(2) : '--';
      const l = cData.low !== undefined ? cData.low.toFixed(2) : '--';
      const c = cData.close !== undefined ? cData.close.toFixed(2) : (cData.value !== undefined ? cData.value.toFixed(2) : '--');
      ohlcEl.innerHTML = `O: <strong class="text-white">$${o}</strong> H: <strong class="text-white">$${h}</strong> L: <strong class="text-white">$${l}</strong> C: <strong class="text-white">$${c}</strong>`;
    }
  });

  window.addEventListener('resize', () => {
    if (lwChart && container) {
      lwChart.applyOptions({ width: container.clientWidth });
    }
  });
}

// Load Candlestick bars from API
async function loadChart(symbol, interval = '1h') {
  try {
    const res = await fetch(`/api/market/chart/binance/${symbol}?interval=${interval}&limit=70`);
    if (!res.ok) return;
    const candles = await res.json();
    if (!candles || candles.length === 0) return;

    if (!lwChart) {
      initChart();
    }
    if (!lwChart) return;

    const formatted = candles.map(c => ({
      time: Math.floor(c.time > 10000000000 ? c.time / 1000 : c.time),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume || 0)
    })).sort((a, b) => a.time - b.time);

    const clean = [];
    let lastT = 0;
    for (const c of formatted) {
      if (c.time > lastT) {
        clean.push(c);
        lastT = c.time;
      }
    }
    cachedCandlesData = clean;

    lwCandleSeries.setData(clean);
    lwLineSeries.setData(clean.map(c => ({ time: c.time, value: c.close })));

    // SMA 20
    const smaData = [];
    for (let i = 0; i < clean.length; i++) {
      if (i >= 19) {
        const avg = clean.slice(i - 19, i + 1).reduce((acc, x) => acc + x.close, 0) / 20;
        smaData.push({ time: clean[i].time, value: avg });
      }
    }
    lwSmaSeries.setData(smaData);

    // Volume
    lwVolumeSeries.setData(clean.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
    })));

    applyMainChartTypeView();
    lwChart.timeScale().fitContent();

    if (clean.length > 0) {
      const last = clean[clean.length - 1];
      const prev = clean.length > 1 ? clean[clean.length - 2] : last;
      const chg = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
      const isUp = chg >= 0;
      document.getElementById('chartPrice').innerText = `$${last.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
      const chgEl = document.getElementById('chartChange');
      chgEl.innerText = `${isUp ? '+' : ''}${chg.toFixed(2)}%`;
      chgEl.className = `text-xs px-2 py-0.5 rounded font-semibold ${isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`;

      document.getElementById('chartOHLC').innerHTML = `O: <strong class="text-white">$${last.open.toFixed(2)}</strong> H: <strong class="text-white">$${last.high.toFixed(2)}</strong> L: <strong class="text-white">$${last.low.toFixed(2)}</strong> C: <strong class="text-white">$${last.close.toFixed(2)}</strong>`;
    }
  } catch (err) {
    console.error('Erro ao carregar gráfico de candles:', err);
  }
}

// Toggle between Candlestick and Line
function setChartType(type) {
  currentChartType = type;
  const btnCandles = document.getElementById('chartTypeBtn-candles');
  const btnLine = document.getElementById('chartTypeBtn-line');
  if (btnCandles && btnLine) {
    if (type === 'candles') {
      btnCandles.className = "px-2.5 py-1 rounded bg-binance text-slate-950 font-bold flex items-center gap-1 transition";
      btnLine.className = "px-2.5 py-1 rounded text-slate-400 hover:text-white flex items-center gap-1 transition";
    } else {
      btnLine.className = "px-2.5 py-1 rounded bg-binance text-slate-950 font-bold flex items-center gap-1 transition";
      btnCandles.className = "px-2.5 py-1 rounded text-slate-400 hover:text-white flex items-center gap-1 transition";
    }
  }
  applyMainChartTypeView();
}

function applyMainChartTypeView() {
  if (!lwCandleSeries || !lwLineSeries) return;
  if (currentChartType === 'candles') {
    lwCandleSeries.applyOptions({ visible: true });
    lwLineSeries.applyOptions({ visible: false });
  } else {
    lwCandleSeries.applyOptions({ visible: false });
    lwLineSeries.applyOptions({ visible: true });
  }
}

// ==================== MODAL DE GRÁFICO INTERATIVO DE CANDLES ====================
function openChartModal(symbol, market, price) {
  modalCurrentSymbol = symbol;
  modalCurrentMarket = market;
  modalCurrentInterval = '1h';
  modalCurrentChartType = 'candles';

  document.getElementById('modalChartSymbol').innerText = symbol;
  document.getElementById('modalChartMarketBadge').innerText = market.toUpperCase();
  const curr = market === 'B3' ? 'R$' : '$';
  document.getElementById('modalChartPrice').innerText = price ? `${curr}${Number(price).toLocaleString()}` : '';

  // Setup trade button in modal
  const tradeBtn = document.getElementById('modalChartTradeBtn');
  if (tradeBtn) {
    tradeBtn.onclick = () => {
      closeChartModal();
      if (market.toLowerCase() === 'binance' || symbol.endsWith('USDT')) {
        selectCrypto(symbol);
        switchTab('crypto');
      } else {
        proposeQuickTrade(symbol, market, price || 25.0);
      }
    };
  }

  // Show modal
  const modal = document.getElementById('chartModal');
  modal.classList.remove('hidden');

  // Initialize or re-create modal chart
  setTimeout(() => {
    initModalChart();
    loadModalChart(symbol, market, modalCurrentInterval);
  }, 60);
}

function closeChartModal() {
  const modal = document.getElementById('chartModal');
  if (modal) modal.classList.add('hidden');
}

function initModalChart() {
  const container = document.getElementById('modalChartContainer');
  if (!container || !window.LightweightCharts) return;

  if (modalLwChart) {
    try { modalLwChart.remove(); } catch(e) {}
    modalLwChart = null;
  }
  container.innerHTML = '';

  modalLwChart = LightweightCharts.createChart(container, {
    width: container.clientWidth || 700,
    height: container.clientHeight || 380,
    layout: {
      background: { type: 'solid', color: '#090d16' },
      textColor: '#94a3b8',
      fontSize: 11,
      fontFamily: 'ui-monospace, monospace'
    },
    grid: {
      vertLines: { color: '#182032' },
      horzLines: { color: '#182032' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: '#F3BA2F', width: 1, style: 2 },
      horzLine: { color: '#F3BA2F', width: 1, style: 2 },
    },
    rightPriceScale: { borderColor: '#1e293b', textColor: '#94a3b8' },
    timeScale: { borderColor: '#1e293b', timeVisible: true, secondsVisible: false },
  });

  modalCandleSeries = modalLwChart.addCandlestickSeries({
    upColor: '#0ECB81',
    downColor: '#F6465D',
    borderVisible: false,
    wickUpColor: '#0ECB81',
    wickDownColor: '#F6465D',
  });

  modalLineSeries = modalLwChart.addLineSeries({
    color: '#F3BA2F',
    lineWidth: 2,
    visible: false,
  });

  modalSmaSeries = modalLwChart.addLineSeries({
    color: '#06B6D4',
    lineWidth: 1.5,
    lineStyle: LightweightCharts.LineStyle.Dotted,
    priceLineVisible: false,
    title: 'SMA 20',
  });

  modalVolumeSeries = modalLwChart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: '',
  });
  modalVolumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.82, bottom: 0 },
  });

  modalLwChart.subscribeCrosshairMove(param => {
    const ohlcEl = document.getElementById('modalChartOHLC');
    if (!ohlcEl) return;
    if (!param || !param.time || !param.seriesData) return;
    const cData = param.seriesData.get(modalCandleSeries) || param.seriesData.get(modalLineSeries);
    if (cData) {
      const o = cData.open !== undefined ? cData.open.toFixed(2) : '--';
      const h = cData.high !== undefined ? cData.high.toFixed(2) : '--';
      const l = cData.low !== undefined ? cData.low.toFixed(2) : '--';
      const c = cData.close !== undefined ? cData.close.toFixed(2) : (cData.value !== undefined ? cData.value.toFixed(2) : '--');
      ohlcEl.innerHTML = `O: <strong class="text-white">$${o}</strong> H: <strong class="text-white">$${h}</strong> L: <strong class="text-white">$${l}</strong> C: <strong class="text-white">$${c}</strong>`;
    }
  });

  window.addEventListener('resize', () => {
    if (modalLwChart && container) {
      modalLwChart.applyOptions({ width: container.clientWidth });
    }
  });
}

async function loadModalChart(symbol, market, interval) {
  try {
    const endpoint = `/api/market/chart/${market.toLowerCase()}/${symbol}?interval=${interval}&limit=70`;
    const res = await fetch(endpoint);
    if (!res.ok) return;
    const candles = await res.json();
    if (!candles || candles.length === 0) return;

    if (!modalLwChart) {
      initModalChart();
    }
    if (!modalLwChart) return;

    const formatted = candles.map(c => ({
      time: Math.floor(c.time > 10000000000 ? c.time / 1000 : c.time),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume || 0)
    })).sort((a, b) => a.time - b.time);

    const clean = [];
    let lastT = 0;
    for (const c of formatted) {
      if (c.time > lastT) {
        clean.push(c);
        lastT = c.time;
      }
    }
    modalCachedCandlesData = clean;

    modalCandleSeries.setData(clean);
    modalLineSeries.setData(clean.map(c => ({ time: c.time, value: c.close })));

    const smaData = [];
    for (let i = 0; i < clean.length; i++) {
      if (i >= 19) {
        const avg = clean.slice(i - 19, i + 1).reduce((acc, x) => acc + x.close, 0) / 20;
        smaData.push({ time: clean[i].time, value: avg });
      }
    }
    modalSmaSeries.setData(smaData);

    modalVolumeSeries.setData(clean.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(14, 203, 129, 0.4)' : 'rgba(246, 70, 93, 0.4)'
    })));

    applyModalChartTypeView();
    modalLwChart.timeScale().fitContent();

    if (clean.length > 0) {
      const last = clean[clean.length - 1];
      const curr = market === 'B3' ? 'R$' : '$';
      document.getElementById('modalChartPrice').innerText = `${curr}${last.close.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
      document.getElementById('modalChartOHLC').innerHTML = `O: <strong class="text-white">${curr}${last.open.toFixed(2)}</strong> H: <strong class="text-white">${curr}${last.high.toFixed(2)}</strong> L: <strong class="text-white">${curr}${last.low.toFixed(2)}</strong> C: <strong class="text-white">${curr}${last.close.toFixed(2)}</strong>`;
    }
  } catch (err) {
    console.error('Erro ao carregar gráfico do modal:', err);
  }
}

function setModalChartType(type) {
  modalCurrentChartType = type;
  const btnCandles = document.getElementById('modalChartTypeBtn-candles');
  const btnLine = document.getElementById('modalChartTypeBtn-line');
  if (btnCandles && btnLine) {
    if (type === 'candles') {
      btnCandles.className = "px-2.5 py-1 rounded bg-binance text-slate-950 font-bold transition";
      btnLine.className = "px-2.5 py-1 rounded text-slate-400 hover:text-white transition";
    } else {
      btnLine.className = "px-2.5 py-1 rounded bg-binance text-slate-950 font-bold transition";
      btnCandles.className = "px-2.5 py-1 rounded text-slate-400 hover:text-white transition";
    }
  }
  applyModalChartTypeView();
}

function applyModalChartTypeView() {
  if (!modalCandleSeries || !modalLineSeries) return;
  if (modalCurrentChartType === 'candles') {
    modalCandleSeries.applyOptions({ visible: true });
    modalLineSeries.applyOptions({ visible: false });
  } else {
    modalCandleSeries.applyOptions({ visible: false });
    modalLineSeries.applyOptions({ visible: true });
  }
}

function changeModalInterval(intv) {
  modalCurrentInterval = intv;
  document.querySelectorAll('.modal-interval-btn').forEach(b => {
    b.className = "modal-interval-btn text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300";
  });
  if (event && event.target) {
    event.target.className = "modal-interval-btn text-xs px-2.5 py-1 rounded bg-binance text-slate-950 font-bold";
  }
  loadModalChart(modalCurrentSymbol, modalCurrentMarket, intv);
}

// Load Binance Order Book Depth
async function loadOrderBook(symbol) {
  try {
    const res = await fetch(`/api/market/orderbook/${symbol}`);
    if (!res.ok) return;
    const depth = await res.json();

    const bidsList = document.getElementById('bidsList');
    const asksList = document.getElementById('asksList');

    if (depth.bids) {
      bidsList.innerHTML = depth.bids.slice(0, 6).map(b => `
        <div class="flex justify-between items-center py-0.5">
          <span class="text-emerald-400 font-bold">$${b[0].toLocaleString()}</span>
          <span class="text-slate-400">${b[1]}</span>
        </div>
      `).join('');
    }

    if (depth.asks) {
      asksList.innerHTML = depth.asks.slice(0, 6).map(a => `
        <div class="flex justify-between items-center py-0.5">
          <span class="text-rose-400 font-bold">$${a[0].toLocaleString()}</span>
          <span class="text-slate-400">${a[1]}</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Erro ao consultar livro de ofertas:', err);
  }
}

// Select Crypto from Pills
function selectCrypto(symbol) {
  currentSymbol = symbol;
  document.getElementById('orderSymbol').value = symbol;
  document.getElementById('chartSymbolTitle').innerText = symbol;

  document.querySelectorAll('.crypto-btn').forEach(b => {
    b.classList.remove('border-binance', 'bg-slate-800');
    b.classList.add('border-cardBorder', 'bg-slate-900');
  });

  const activeBtn = document.getElementById(`cbtn-${symbol}`);
  if (activeBtn) {
    activeBtn.classList.add('border-binance', 'bg-slate-800');
    activeBtn.classList.remove('border-cardBorder', 'bg-slate-900');
  }

  loadChart(symbol, currentInterval);
  loadOrderBook(symbol);
}

// Change Chart Interval
function changeInterval(intv) {
  currentInterval = intv;
  document.querySelectorAll('.interval-btn').forEach(b => {
    b.className = "interval-btn text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-300";
  });
  event.target.className = "interval-btn text-xs px-2.5 py-1 rounded bg-binance text-slate-950 font-bold";
  loadChart(currentSymbol, currentInterval);
}

// Order Side Selector
function setOrderSide(side) {
  currentSide = side;
  const buyBtn = document.getElementById('sideBtn-BUY');
  const sellBtn = document.getElementById('sideBtn-SELL');

  if (side === 'BUY') {
    buyBtn.className = "py-2.5 rounded-lg font-bold text-xs transition bg-accentGreen text-white shadow-lg shadow-emerald-500/20";
    sellBtn.className = "py-2.5 rounded-lg font-bold text-xs transition bg-slate-800 text-slate-400 hover:text-white";
  } else {
    sellBtn.className = "py-2.5 rounded-lg font-bold text-xs transition bg-accentRed text-white shadow-lg shadow-rose-500/20";
    buyBtn.className = "py-2.5 rounded-lg font-bold text-xs transition bg-slate-800 text-slate-400 hover:text-white";
  }
}

// Preset notional click
function setNotional(val) {
  document.getElementById('orderNotional').value = val.toFixed(2);
}

// Toggle Price Field for Limit Orders
function togglePriceField() {
  const type = document.getElementById('orderType').value;
  const container = document.getElementById('priceFieldContainer');
  if (type === 'LIMIT') {
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

// Whitelist Helpers
function addCoinToWhitelist(coin) {
  const input = document.getElementById('cfgCryptoWhitelist');
  if (!input) return;
  const current = input.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (!current.includes(coin.toUpperCase())) {
    current.push(coin.toUpperCase());
    input.value = current.join(', ');
    showToast(`Moeda ${coin} adicionada à Whitelist.`);
  }
}

function resetDefaultWhitelist() {
  const input = document.getElementById('cfgCryptoWhitelist');
  if (input) {
    input.value = 'BTC, ETH, AAVE, SOL, LINK';
    showToast('Whitelist restaurada para as 5 criptos padrão.');
  }
}

function toggleAutoTraderSwitch() {
  const enabled = document.getElementById('cfgAutoTradingEnabled').checked;
  const badge = document.getElementById('autoTraderStatusBadge');
  if (badge) {
    badge.innerText = enabled ? 'ATIVO' : 'DESATIVADO';
    badge.className = `text-xs px-2.5 py-1 rounded-full font-bold ${enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`;
  }
}

// Auto-Trading Status Poller & Renderer
async function loadAutoTradingStatus() {
  try {
    const res = await fetch('/api/autotrading/status');
    if (!res.ok) return;
    const data = await res.json();

    // 1. Header Widget
    const headerStat = document.getElementById('statAutoTrading');
    const headerDot = document.getElementById('autoTraderHeaderDot');
    if (headerStat && headerDot) {
      if (!data.enabled) {
        headerStat.innerText = 'DESATIVADO';
        headerStat.className = 'font-bold text-slate-400 mono text-xs';
        headerDot.className = 'w-2 h-2 rounded-full bg-slate-500';
      } else if (data.quota_exhausted) {
        headerStat.innerText = 'PAUSADO (Limite)';
        headerStat.className = 'font-bold text-rose-400 mono text-xs';
        headerDot.className = 'w-2 h-2 rounded-full bg-rose-500 badge-pulse';
      } else {
        headerStat.innerText = `ATIVO ($${data.current_spent_usd.toFixed(2)} / $${data.max_spend_usd.toFixed(2)})`;
        headerStat.className = 'font-bold text-emerald-400 mono text-xs';
        headerDot.className = 'w-2 h-2 rounded-full bg-emerald-400 badge-pulse';
      }
    }

    // 2. Settings Panel Elements
    const badge = document.getElementById('autoTraderStatusBadge');
    const toggle = document.getElementById('cfgAutoTradingEnabled');
    const spendText = document.getElementById('autoTraderSpendText');
    const bar = document.getElementById('autoTraderProgressBar');
    const logsBox = document.getElementById('autoTraderLogsBox');

    if (toggle && !toggle.matches(':focus')) {
      toggle.checked = !!data.enabled;
    }

    if (badge) {
      if (!data.enabled) {
        badge.innerText = 'DESATIVADO';
        badge.className = 'text-xs px-2.5 py-1 rounded-full font-bold bg-slate-800 text-slate-400 border border-slate-700';
      } else if (data.quota_exhausted) {
        badge.innerText = 'PAUSADO (Limite de Saldo Atingido)';
        badge.className = 'text-xs px-2.5 py-1 rounded-full font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30';
      } else {
        badge.innerText = 'OPERANDO AUTOMATICAMENTE';
        badge.className = 'text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 badge-pulse';
      }
    }

    if (spendText) {
      spendText.innerText = `$${data.current_spent_usd.toFixed(2)} de $${data.max_spend_usd.toFixed(2)} USD (Disponível para robô: $${data.remaining_spend_usd.toFixed(2)})`;
    }

    if (bar) {
      const pct = Math.min(100, Math.max(0, (data.current_spent_usd / (data.max_spend_usd || 1)) * 100));
      bar.style.width = `${pct}%`;
      bar.className = pct >= 100 ? 'bg-rose-500 h-2 transition-all duration-500' : 'bg-binance h-2 transition-all duration-500';
    }

    if (logsBox && data.recent_logs) {
      if (data.recent_logs.length > 0) {
        logsBox.innerHTML = data.recent_logs.map(log => `<div>${log}</div>`).join('');
      } else {
        logsBox.innerHTML = `<div class="text-slate-500">Aguardando próximo ciclo de varredura...</div>`;
      }
    }
  } catch (err) {
    console.error('Erro ao consultar status do bot:', err);
  }
}

// Trigger immediate scan and auto trade
async function triggerAutoTradingRun() {
  try {
    showToast('Executando ciclo de varredura automática...');
    const res = await fetch('/api/autotrading/run', { method: 'POST' });
    const data = await res.json();
    if (data.status === 'disabled') {
      showToast('O robô está desativado nas configurações.', false);
    } else if (data.status === 'quota_reached') {
      showToast(data.message, false);
    } else {
      showToast(`Ciclo concluído. ${data.executed_count || 0} ordens executadas.`);
      loadTickets();
      loadPortfolio();
    }
    loadAutoTradingStatus();
  } catch (err) {
    showToast('Erro ao acionar ciclo automático', false);
  }
}

// Reset spend limit quota
async function resetAutoTradingSpend() {
  try {
    const res = await fetch('/api/autotrading/reset-spend', { method: 'POST' });
    if (res.ok) {
      showToast('Quota de saldo automático reiniciada com sucesso!');
      loadAutoTradingStatus();
    }
  } catch (err) {
    showToast('Erro ao reiniciar quota', false);
  }
}

// Load Configuration Form
async function loadConfigForm() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const cfg = await res.json();

    // 1. Auto-Trading
    const autoToggle = document.getElementById('cfgAutoTradingEnabled');
    if (autoToggle) autoToggle.checked = !!cfg.auto_trading_enabled;
    const maxSpend = document.getElementById('cfgAutoTradingMaxSpend');
    if (maxSpend) maxSpend.value = cfg.auto_trading_max_spend_usd ?? 50.0;
    const ordSize = document.getElementById('cfgAutoTradingOrderSize');
    if (ordSize) ordSize.value = cfg.auto_trading_order_size_usd ?? 10.0;
    const minConf = document.getElementById('cfgAutoTradingMinConf');
    if (minConf) minConf.value = cfg.auto_trading_min_confidence ?? 80;

    // 2. Binance & Whitelist
    document.getElementById('cfgBinanceLive').checked = !!cfg.binance_live;
    document.getElementById('cfgApiKey').value = cfg.binance_api_key || '';
    document.getElementById('cfgApiSecret').value = cfg.binance_api_secret || '';
    document.getElementById('cfgTestnet').checked = !!cfg.binance_testnet;
    
    const wlCheck = document.getElementById('cfgCryptoWhitelistEnabled');
    if (wlCheck) wlCheck.checked = !!cfg.crypto_whitelist_enabled;
    const wlInput = document.getElementById('cfgCryptoWhitelist');
    if (wlInput) {
      const arr = cfg.crypto_whitelist || ['BTC', 'ETH', 'AAVE', 'SOL', 'LINK'];
      wlInput.value = arr.join(', ');
    }

    // 3. US Market (Alpaca)
    const usEnabled = document.getElementById('cfgUsMarketEnabled');
    if (usEnabled) usEnabled.checked = cfg.us_market_enabled !== false;
    const usBudget = document.getElementById('cfgUsBudget');
    if (usBudget) usBudget.value = cfg.us_budget_usd ?? 100.0;
    const usMaxOrder = document.getElementById('cfgUsMaxOrder');
    if (usMaxOrder) usMaxOrder.value = cfg.us_max_order_usd ?? 25.0;

    if (document.getElementById('cfgAlpacaKey')) {
      document.getElementById('cfgAlpacaKey').value = cfg.alpaca_api_key || '';
      document.getElementById('cfgAlpacaSecret').value = cfg.alpaca_api_secret || '';
      document.getElementById('cfgAlpacaPaper').checked = cfg.alpaca_paper !== false;
    }

    // 4. B3 Market (MT5)
    const b3Enabled = document.getElementById('cfgB3MarketEnabled');
    if (b3Enabled) b3Enabled.checked = cfg.b3_market_enabled !== false;
    const b3Budget = document.getElementById('cfgB3Budget');
    if (b3Budget) b3Budget.value = cfg.b3_budget_brl ?? 1000.0;
    const b3MaxOrder = document.getElementById('cfgB3MaxOrder');
    if (b3MaxOrder) b3MaxOrder.value = cfg.b3_max_order_brl ?? 250.0;
    const b3Frac = document.getElementById('cfgB3AllowFractional');
    if (b3Frac) b3Frac.checked = cfg.b3_allow_fractional !== false;

    if (document.getElementById('cfgMt5Enabled')) {
      document.getElementById('cfgMt5Enabled').checked = cfg.mt5_enabled !== false;
    }

    // 5. Global Risk
    document.getElementById('cfgBudget').value = cfg.budget || 100.0;
    document.getElementById('cfgMaxOrder').value = cfg.max_order_usd || 25.0;
    document.getElementById('cfgCashBuffer').value = cfg.cash_buffer_pct || 15;
    document.getElementById('cfgMaxPosition').value = cfg.max_position_pct || 30;

    loadAutoTradingStatus();
  } catch (err) {
    console.error('Erro ao carregar configurações:', err);
  }
}

// Save Settings
async function saveSettings() {
  const rawWhitelist = (document.getElementById('cfgCryptoWhitelist')?.value || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

  const payload = {
    // Binance & Whitelist
    binance_live: document.getElementById('cfgBinanceLive').checked,
    binance_api_key: document.getElementById('cfgApiKey').value.trim(),
    binance_api_secret: document.getElementById('cfgApiSecret').value.trim(),
    binance_testnet: document.getElementById('cfgTestnet').checked,
    crypto_whitelist_enabled: document.getElementById('cfgCryptoWhitelistEnabled')?.checked || false,
    crypto_whitelist: rawWhitelist.length > 0 ? rawWhitelist : ['BTC', 'ETH', 'AAVE', 'SOL', 'LINK'],

    // US Market
    us_market_enabled: document.getElementById('cfgUsMarketEnabled')?.checked !== false,
    us_budget_usd: parseFloat(document.getElementById('cfgUsBudget')?.value) || 100.0,
    us_max_order_usd: parseFloat(document.getElementById('cfgUsMaxOrder')?.value) || 25.0,
    alpaca_api_key: document.getElementById('cfgAlpacaKey') ? document.getElementById('cfgAlpacaKey').value.trim() : '',
    alpaca_api_secret: document.getElementById('cfgAlpacaSecret') ? document.getElementById('cfgAlpacaSecret').value.trim() : '',
    alpaca_paper: document.getElementById('cfgAlpacaPaper') ? document.getElementById('cfgAlpacaPaper').checked : true,

    // B3 Market
    b3_market_enabled: document.getElementById('cfgB3MarketEnabled')?.checked !== false,
    b3_budget_brl: parseFloat(document.getElementById('cfgB3Budget')?.value) || 1000.0,
    b3_max_order_brl: parseFloat(document.getElementById('cfgB3MaxOrder')?.value) || 250.0,
    b3_allow_fractional: document.getElementById('cfgB3AllowFractional')?.checked !== false,
    mt5_enabled: document.getElementById('cfgMt5Enabled') ? document.getElementById('cfgMt5Enabled').checked : true,

    // Auto-Trading Bot
    auto_trading_enabled: document.getElementById('cfgAutoTradingEnabled')?.checked || false,
    auto_trading_max_spend_usd: parseFloat(document.getElementById('cfgAutoTradingMaxSpend')?.value) || 50.0,
    auto_trading_order_size_usd: parseFloat(document.getElementById('cfgAutoTradingOrderSize')?.value) || 10.0,
    auto_trading_min_confidence: parseInt(document.getElementById('cfgAutoTradingMinConf')?.value) || 80,

    // Global Risk
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
      showToast('Todas as configurações e parâmetros foram salvos com sucesso!');
      loadPortfolio();
      loadAutoTradingStatus();
      loadRecommendations();
    } else {
      showToast('Falha ao salvar configurações', false);
    }
  } catch (err) {
    showToast('Erro ao salvar', false);
  }
}

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
