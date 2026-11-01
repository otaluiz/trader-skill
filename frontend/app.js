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
let bentoUnmount = null;
let latestPortfolioData = null;

function switchTab(tabId) {
  activeTab = tabId;
  const tabs = ['bento', 'recs', 'crypto', 'b3', 'us', 'trades', 'settings'];
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

  if (tabId === 'bento') {
    renderFinanceBento();
  } else if (tabId === 'crypto') {
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
    latestPortfolioData = data;

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


// ==========================================
// FINANCE BENTO INTEGRATION ENGINE
// ==========================================

function getLiveBentoData() {
  const p = latestPortfolioData || {};
  const b = p.binance || {};
  const balances = b.balances || [];
  const usdtBal = balances.find(x => x.asset === 'USDT')?.free || 450.0;
  
  const currentFiat = Math.max(1000, usdtBal * 20 + 8000);
  const currentStocks = 27000;
  const currentCrypto = Math.max(3000, (b.total_estimated_usd || 500) * 15 + 4000);

  // 36 months of history with realistic growth curve
  const history = Array.from({ length: 36 }, (_, i) => {
    const t = i / 35;
    const d = new Date(2026, 9 - (35 - i), 1);
    const noise = (Math.sin(i * 12.9898 + 156.466) * 43758.5453) % 1;
    return {
      date: d.toISOString(),
      fiat: 12000 + t * (currentFiat - 12000) + Math.sin(i * 0.9) * 800,
      stocks: 10000 + t * (currentStocks - 10000) + Math.sin(i * 0.55) * 1200 + noise * 600,
      crypto: Math.max(2000, 3000 + t * (currentCrypto - 3000) + Math.sin(i * 0.8 + 1) * 2000 + Math.cos(i * 0.33) * 1000),
    };
  });

  return {
    history,
    payments: [
      { name: "Alpaca Auto-Buy (SPY)", date: "Nov 3", amount: 250 },
      { name: "Binance DCA (BTC)", date: "Nov 5", amount: 100 },
      { name: "B3 MT5 Margin Buffer", date: "Nov 8", amount: 350 },
    ],
    goals: [
      { name: "Trader Capital Target", progress: 0.68, target: 50000 },
      { name: "Crypto Reserve", progress: 0.84, target: 15000 },
    ],
    cashflow: {
      months: ["May", "Jun", "Jul", "Aug", "Sep", "Oct"],
      income: [[3.2, 4.5, 6.1, 7.2, 5.8, 4.2], [2.4, 3.8, 5.0, 6.0, 4.9, 3.5], [2.0, 2.9, 4.1, 4.8, 3.8, 2.8]],
      spending: [[1.5, 2.4, 3.9, 4.8, 3.6, 2.1], [1.2, 2.0, 3.2, 4.0, 3.0, 1.8], [1.0, 1.6, 2.6, 3.2, 2.4, 1.4]],
    },
    crypto: [
      { name: "Bitcoin", symbol: "BTC", share: 0.58, change: "+3.4%", ohlc: [[66.1, 67.0, 65.8, 66.8], [66.8, 67.6, 66.5, 67.4], [67.4, 67.9, 66.9, 67.1], [67.1, 68.2, 67.0, 68.0], [68.0, 68.9, 67.8, 68.7], [68.7, 69.1, 68.1, 68.4], [68.4, 69.6, 68.3, 69.4]] },
      { name: "Ethereum", symbol: "ETH", share: 0.28, change: "-0.6%", ohlc: [[3.52, 3.58, 3.44, 3.47], [3.47, 3.55, 3.4, 3.53], [3.53, 3.56, 3.38, 3.41], [3.41, 3.5, 3.36, 3.48], [3.48, 3.51, 3.39, 3.43], [3.43, 3.49, 3.37, 3.46], [3.46, 3.52, 3.42, 3.44]] },
      { name: "Solana", symbol: "SOL", share: 0.14, change: "+5.8%", ohlc: [[142, 149, 139, 147], [147, 151, 141, 143], [143, 156, 142, 154], [154, 158, 147, 149], [149, 162, 148, 160], [160, 166, 155, 157], [157, 171, 156, 168]] },
    ],
    stocks: { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], values: [2.5, 1.8, 4.2, 2.9, 5.1] },
  };
}

function renderFinanceBento() {
  const container = document.getElementById('financeBentoRoot');
  if (!container) return;

  if (bentoUnmount) {
    try { bentoUnmount(); } catch (e) {}
    bentoUnmount = null;
  }

  const data = getLiveBentoData();
  const avatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80';

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const markup = (o) => `<div class="fpb-c canvas">
      <div class="top">
        <h1>${esc(o.title)}<span id="asof">${esc(o.subtitle)}</span></h1>
        <div class="ctrls"><div class="seg" id="period" role="group" aria-label="Period"></div>
        <div class="seg" id="ccy" role="group" aria-label="Currency"></div></div>
        ${o.avatar?`<img class="ava" alt="${esc(o.avatarAlt)}" src="${esc(o.avatar)}">`:""}
      </div>
      <div class="grid" id="grid">
        <!-- net worth -->
        <section class="card h1" id="nw" aria-label="Net worth"></section>
        <!-- allocation -->
        <section class="card h1" id="alloc" aria-label="Allocation"></section>
        <!-- KPI row -->
        <section class="card h2 kpi" id="ret" aria-label="Portfolio return"></section>
        <section class="card glass h2 kpi" id="cash" aria-label="Free cash"></section>
        <section class="card glass h2 kpi" id="pay" aria-label="Upcoming payments"></section>
        <section class="card glass h2 kpi" id="goals" aria-label="Goals"></section>
        <!-- bottom row -->
        <section class="card h3" id="flow" aria-label="Cash flow"></section>
        <section class="card h3" id="crypto" aria-label="Crypto"></section>
        <section class="card h3" id="stocks" aria-label="Stocks"></section>
      </div>
    </div>
    <div class="tip" id="tip"></div>`;

  container.innerHTML = markup({
    title: "Trader Skill Overview",
    subtitle: "Multi-Broker Quant Portfolio",
    avatar: avatarUrl,
    avatarAlt: "Trader",
    credit: false
  });

  bentoUnmount = mountBento(container, data);
}

function mountBento(root, data) {
  let alive = true;
  const frames = new Set();
  const RAF = (cb) => { if (!alive) return 0; const id = requestAnimationFrame((t) => { frames.delete(id); if (alive) cb(t); }); frames.add(id); return id; };
  const $id = (id) => root.querySelector("#" + id);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ACC = '#E8FF1F', T2 = 'rgba(255,255,255,.56)', T3 = 'rgba(255,255,255,.38)', HAIR = 'rgba(255,255,255,.14)';
  const COL = { fiat: '#FFFFFF', stocks: '#A9B2FF', crypto: '#FFB37A' };
  const ease = t => 1 - Math.pow(1 - t, 3);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (t, a = {}, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); p && p.appendChild(e); return e; };

  const S = { period: '1Y', ccy: 'USD' };
  const RATE = { USD: 1, EUR: 0.92 }, SYM = { USD: '$', EUR: '€' };
  const money = (v, { dec = 0, compact = false } = {}) => {
    v *= RATE[S.ccy]; const s = SYM[S.ccy];
    if (compact && Math.abs(v) >= 1000) return s + (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1) + 'K';
    return (v < 0 ? '−' : '') + s + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  };

  const H = data.history.map(h => ({ d: new Date(h.date), fiat: h.fiat, stocks: h.stocks, crypto: h.crypto }));
  function series() {
    if (S.period === 'All') return H.map(h => ({ ...h, l: h.d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) }));
    if (S.period === '1Y') return H.slice(-12).map(h => ({ ...h, l: h.d.toLocaleDateString('en-US', { month: 'short' }) }));
    const n = S.period === '3M' ? 13 : 5, src = H.slice(S.period === '3M' ? -4 : -2), out = [];
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1) * (src.length - 1), i = Math.min(src.length - 2, Math.floor(f)), t = f - i, a = src[i], b = src[i + 1], w = Math.sin(k * 1.7) * 0.012;
      const d = new Date(H[H.length - 1].d.getTime() - (n - 1 - k) * 7 * 864e5);
      out.push({ d, l: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), fiat: (a.fiat + (b.fiat - a.fiat) * t) * (1 + w * 0.3), stocks: (a.stocks + (b.stocks - a.stocks) * t) * (1 + w), crypto: (a.crypto + (b.crypto - a.crypto) * t) * (1 + w * 2.4) });
    }
    return out;
  }
  const total = p => p.fiat + p.stocks + p.crypto;

  function bg({ top, base, bottom, core }) {
    return `<div class="g" style="background:linear-gradient(180deg,${top} 0%,${base} 36%,${base} 74%,${bottom} 100%)"></div><div class="core" style="background:${core}"></div>`;
  }
  const GR = {
    blue: { top: '#b9a6ff', base: '#2e43ff', bottom: '#6d7dff', core: '#05082a' },
    graph: { top: '#9a9aa8', base: '#3a3a44', bottom: '#55555f', core: '#060608' },
    pink: { top: '#ffb3d6', base: '#ff2a85', bottom: '#ff6aa8', core: '#3a031c' },
    copper: { top: '#f6bf96', base: '#c2683a', bottom: '#dc8a5c', core: '#1d0b05' },
    green: { top: '#a6e8c8', base: '#36956f', bottom: '#58b58c', core: '#061d15' },
    lime: { top: '#f4ffb8', base: '#a3c400', bottom: '#c9e03a', core: '#121700' },
  };

  function smoothPath(P, move = true) {
    let d = (move ? 'M' : 'L') + `${P[0][0]},${P[0][1]}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2, k = 0.17;
      d += `C${p1[0] + (p2[0] - p0[0]) * k},${p1[1] + (p2[1] - p0[1]) * k} ${p2[0] - (p3[0] - p1[0]) * k},${p2[1] - (p3[1] - p1[1]) * k} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  const P2 = (r, a) => [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180)];
  const F = { '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'], '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'], '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'], '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'], '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'], '€': ['00111', '01000', '11110', '01000', '11110', '01000', '00111'], ',': ['0', '0', '0', '0', '0', '1', '1'], ' ': ['00', '00', '00', '00', '00', '00', '00'] };

  function DotNumber(host, pitch) {
    const cols = 48, svg = el('svg', { class: 'dots', 'aria-hidden': 'true' }, host), cells = [];
    for (let c = 0; c < cols; c++) for (let r = 0; r < 7; r++) {
      const ci = el('circle', { cx: c * pitch + pitch / 2, cy: r * pitch + pitch / 2, r: pitch * 0.36, fill: '#fff', opacity: 0 }, svg);
      ci.style.transitionDelay = (c * 7) + 'ms'; cells.push([c, r, ci]);
    }
    const set = t => {
      const on = new Set(); let x = 0;
      for (const ch of t) {
        const g = F[ch] || F[' ']; const w = g[0].length;
        for (let r = 0; r < 7; r++) for (let k = 0; k < w; k++) if (g[r][k] === '1') on.add((x + k) * 8 + r);
        x += w + 1;
      }
      const used = Math.max(1, x - 1);
      for (const [c, r, ci] of cells) {
        const v = on.has(c * 8 + r); ci.setAttribute('opacity', v ? 1 : (c < used ? 0.08 : 0));
        ci.style.transform = v ? 'none' : 'scale(.55)';
      }
      svg.setAttribute('width', used * pitch); svg.setAttribute('height', 7 * pitch); svg.setAttribute('viewBox', `0 0 ${used * pitch} ${7 * pitch}`);
    };
    let raf = 0, cur = 0;
    return {
      count(to, dur = 900) {
        cancelAnimationFrame(raf); const from = cur, t0 = performance.now(); let last = '';
        const f = now => {
          const t = reduce ? 1 : Math.min(1, (now - t0) / dur); cur = from + (to - from) * ease(t);
          const s = SYM[S.ccy] + Math.round(cur * RATE[S.ccy]).toLocaleString('en-US');
          if (s !== last) { set(s); last = s; }
          if (t < 1) raf = RAF(f);
        };
        raf = RAF(f);
      }
    };
  }

  function tween(node, to, fmt, dur = 900) {
    const from = +node.dataset.v || 0, t0 = performance.now(); node.dataset.v = to;
    (function f(now) { const t = reduce ? 1 : Math.min(1, (now - t0) / dur); node.textContent = fmt(from + (to - from) * ease(t)); if (t < 1) RAF(f); })(t0);
  }

  const tip = $id('tip');
  function showTip(x, y, title, rows) {
    if (!tip) return;
    tip.innerHTML = `<div class="t">${title}</div>` + rows.map(([k, v, c]) => `<div class="r"><span>${c ? `<i style="background:${c}"></i>` : ''}${k}</span><b>${v}</b></div>`).join('');
    tip.classList.add('on'); const r = tip.getBoundingClientRect(); let L = x + 16, T = y - r.height - 14;
    if (L + r.width > innerWidth - 8) L = x - r.width - 16; if (T < 8) T = y + 16;
    tip.style.left = L + 'px'; tip.style.top = T + 'px';
  }
  const hideTip = () => tip && tip.classList.remove('on');

  // NW Card
  const nw = $id('nw');
  nw.innerHTML = `${bg(GR.blue)}<div class="in-c">
    <div class="row hrow" style="justify-content:space-between"><div class="ttl">Net worth Multi-Broker</div>
      <div class="legend"><span><i style="background:${COL.fiat}"></i>Fiat</span><span><i style="background:${COL.stocks}"></i>Stocks (US+B3)</span><span><i style="background:${COL.crypto}"></i>Crypto (Binance)</span></div></div>
    <div class="row nrow" style="margin-top:16px;align-items:flex-end;gap:16px"><div class="nwn"></div>
      <div style="padding-bottom:6px"><div class="delta nwd"></div><div class="muted nwc" style="margin-top:3px"></div></div></div>
    <svg class="nws" style="position:absolute;left:0;right:0;bottom:0;display:block" aria-hidden="true"></svg></div><div class="rim"></div>`;
  const nwNum = DotNumber(nw.querySelector('.nwn'), innerWidth < 520 ? 5.4 : 7);
  let nwGrow = 0, nwRaf = 0, nwData = null;

  function drawNW() {
    const svg = nw.querySelector('.nws'), W = nw.clientWidth || 700, Hh = 226, top = 26, bot = 26, mid = top + (Hh - top - bot) / 2;
    svg.setAttribute('width', W); svg.setAttribute('height', Hh); svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    const D = nwData, n = D.length, tots = D.map(total), mx = Math.max(...tots), mn = Math.min(...tots), floor = mn - (mx - mn) * 0.9, half = (Hh - top - bot) / 2;
    const k = p => ((total(p) - floor) / (mx - floor)) * half * 2 / total(p);
    const X = i => -20 + i / (n - 1) * (W + 40);
    const g = ease(nwGrow);
    const lay = D.map(p => { const q = k(p) * g / 2, f = p.fiat * q, s = p.stocks * q, c = p.crypto * q; return { f, fs: f + s, fsc: f + s + c }; });
    const band = k => { const T = D.map((p, i) => [X(i), mid - lay[i][k]]), B = D.map((p, i) => [X(i), mid + lay[i][k]]).reverse(); return smoothPath(T) + smoothPath(B, false) + 'Z'; };
    const marks = [Math.round((n - 1) * 0.18), Math.round((n - 1) * 0.55), n - 1];
    svg.innerHTML = `
      <defs><linearGradient id="nwf" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".25" stop-color="#fff" stop-opacity="1"/></linearGradient>
        <mask id="nwm"><rect width="${W}" height="${Hh}" fill="url(#nwf)"/></mask></defs>
      <g mask="url(#nwm)"><path d="${band('fsc')}" fill="${COL.crypto}" opacity=".95"/><path d="${band('fs')}" fill="${COL.stocks}"/><path d="${band('f')}" fill="${COL.fiat}" opacity=".95"/></g>
      ${marks.map((i, k) => { const x = Math.min(W - 36, Math.max(36, X(i))); const t = total(D[i]); return `<g style="opacity:${g > 0.6 ? 1 : 0};transition:opacity .4s ${k * 0.08}s">
        <line x1="${x}" x2="${x}" y1="${top - 4}" y2="${Hh - bot + 4}" stroke="rgba(0,0,0,.55)" stroke-width="1.5"/>
        <rect x="${x - 34}" y="${top - 14}" width="68" height="22" rx="11" fill="#000"/><text x="${x}" y="${top + 1}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff" font-family="Geist Mono">${money(t, { compact: true })}</text>
        <rect x="${x - 30}" y="${Hh - bot - 8}" width="60" height="22" rx="11" fill="#000"/><text x="${x}" y="${Hh - bot + 7}" text-anchor="middle" font-size="10.5" font-weight="500" fill="rgba(255,255,255,.7)" font-family="Geist Mono">${D[i].l}</text></g>`; }).join('')}
      <line class="hl" y1="${top}" y2="${Hh - bot}" stroke="#fff" stroke-width="1.5" opacity="0"/>
      <rect width="${W}" height="${Hh}" fill="transparent" class="hit"/>`;
    const hit = svg.querySelector('.hit'), hl = svg.querySelector('.hl');
    hit.onpointermove = e => {
      const r = svg.getBoundingClientRect(), z = r.width / W, x = (e.clientX - r.left) / z; const i = Math.max(0, Math.min(n - 1, Math.round((x + 20) / (W + 40) * (n - 1)))); const p = D[i];
      hl.setAttribute('x1', X(i)); hl.setAttribute('x2', X(i)); hl.setAttribute('opacity', 1);
      showTip(r.left + X(i) * z, r.top + (mid - lay[i].fsc) * z, p.l, [['Crypto', money(p.crypto), COL.crypto], ['Stocks', money(p.stocks), COL.stocks], ['Fiat', money(p.fiat), COL.fiat], ['Total', money(total(p))]]);
    };
    hit.onpointerleave = () => { hl.setAttribute('opacity', 0); hideTip(); };
  }

  function updateNW() {
    nwData = series(); const D = nwData, a = total(D[0]), b = total(D[D.length - 1]);
    nwNum.count(b);
    nw.querySelector('.nwd').textContent = (b >= a ? '↑ ' : '↓ ') + Math.abs((b - a) / a * 100).toFixed(1) + '%';
    nw.querySelector('.nwc').textContent = (b >= a ? '+' : '−') + money(Math.abs(b - a)) + ' ' + ({ '1M': 'this month', '3M': 'in 3 months', '1Y': 'this year', 'All': 'in 3 years' })[S.period];
    cancelAnimationFrame(nwRaf); const t0 = performance.now(); nwGrow = 0;
    const f = now => { nwGrow = reduce ? 1 : Math.min(1, (now - t0) / 1100); drawNW(); if (nwGrow < 1) nwRaf = RAF(f); }; nwRaf = RAF(f);
  }

  // Allocation Card
  const al = $id('alloc');
  al.innerHTML = `${bg(GR.graph)}<div class="in-c">
    <div class="row" style="justify-content:space-between"><div class="ttl">Alocação de Ativos</div><span class="chip" style="background:rgba(255,255,255,.12)">Target 60/40</span></div>
    <svg class="alg" width="300" height="168" viewBox="-150 -150 300 168" style="position:absolute;left:50%;margin-left:-150px;top:70px" aria-hidden="true"></svg>
    <div class="all" style="position:absolute;left:24px;right:24px;bottom:20px"></div></div><div class="rim"></div>`;

  function updateAlloc() {
    const p = nwData[nwData.length - 1], t = total(p), fr = { stocks: p.stocks / t, crypto: p.crypto / t, fiat: p.fiat / t };
    const n = 56, svg = al.querySelector('.alg'); let s = '';
    for (let i = 0; i <= n; i++) {
      const f = i / n, a = 180 + f * 180, cls = f <= fr.stocks ? 'stocks' : f <= fr.stocks + fr.crypto ? 'crypto' : 'fiat'; const [x1, y1] = P2(136, a), [x2, y2] = P2(i % 7 === 0 ? 112 : 118, a);
      s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${COL[cls]}" stroke-opacity="${cls === 'fiat' ? 0.35 : 1}" stroke-width="3.2" stroke-linecap="round" style="opacity:0;animation:tk .4s ${i * 12}ms forwards"/>`;
    }
    const inv = Math.round((fr.stocks + fr.crypto) * 100);
    s += `<text y="-22" text-anchor="middle" font-family="Geist" font-weight="200" font-size="52" fill="#fff" letter-spacing="-2">${inv}<tspan font-size="17" dy="-24" fill="${T2}">%</tspan></text><text y="0" text-anchor="middle" font-size="12" font-weight="500" fill="${T3}" font-family="Geist">invested</text>`;
    svg.innerHTML = `<style>@keyframes tk{to{opacity:1}}</style>` + s;
    al.querySelector('.all').innerHTML = [['Stocks (US/B3)', fr.stocks, p.stocks, 'stocks'], ['Crypto (Binance)', fr.crypto, p.crypto, 'crypto'], ['Fiat (USDT/USD)', fr.fiat, p.fiat, 'fiat']].map(([k, f, v, c], i) =>
      `<div class="row" style="height:30px;${i ? 'border-top:1px solid rgba(255,255,255,.1)' : ''}"><i style="width:8px;height:8px;border-radius:50%;background:${COL[c]}"></i><span style="flex:1;font-size:13px;font-weight:600">${k}</span><span class="mono muted" style="width:44px;text-align:right">${Math.round(f * 100)}%</span><span class="mono" style="width:76px;text-align:right;font-size:13px">${money(v)}</span></div>`).join('');
  }

  // Return Card
  const ret = $id('ret');
  ret.innerHTML = `${bg(GR.lime)}<div class="in-c"><div class="row" style="justify-content:space-between"><div class="cap">Portfolio return</div><span class="chip rtc">+$0</span></div>
    <div style="position:absolute;left:22px;bottom:32px;display:flex;align-items:center;gap:8px"><svg width="30" height="36" viewBox="0 0 34 40" aria-hidden="true"><path d="M17 37V5M5 17L17 5l12 12" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="big rtv" style="font-size:52px">0%</span></div>
    <div class="muted rtp" style="position:absolute;left:24px;bottom:14px;font-size:11.5px"></div></div><div class="rim"></div>`;

  function updateRet() {
    const D = nwData, inv0 = D[0].stocks + D[0].crypto, inv1 = D[D.length - 1].stocks + D[D.length - 1].crypto, r = (inv1 - inv0) / inv0 * 100;
    tween(ret.querySelector('.rtv'), r, v => v.toFixed(1) + '%'); ret.querySelector('.rtc').textContent = '+' + money(inv1 - inv0, { compact: true });
    ret.querySelector('.rtp').textContent = 'Stocks + crypto · ' + ({ '1M': 'last month', '3M': 'last 3 months', '1Y': 'last 12 months', 'All': 'last 3 years' })[S.period];
  }

  // Cash Runway Card
  const cash = $id('cash');
  cash.innerHTML = `<div class="in-c"><div class="row" style="justify-content:space-between"><div class="cap">Free cash & Runway</div><span class="muted">Buffer</span></div>
    <div class="row" style="margin-top:14px;align-items:baseline;justify-content:space-between"><span class="big csv" style="font-size:38px">0</span><span class="mono" style="font-size:20px;font-weight:500"><span class="crw">0</span><span class="muted" style="font-size:12px"> mo</span></span></div>
    <svg class="cst" width="100%" height="22" style="position:absolute;left:24px;right:24px;bottom:22px;width:calc(100% - 48px)" aria-hidden="true"></svg></div>`;

  function updateCash() {
    const v = nwData[nwData.length - 1].fiat * 0.42, mo = v / 2100; tween(cash.querySelector('.csv'), v, x => money(x)); tween(cash.querySelector('.crw'), mo, x => x.toFixed(1));
    const svg = cash.querySelector('.cst'), W = svg.getBoundingClientRect().width || 220, n = 36; let s = '';
    for (let i = 0; i < n; i++) {
      const x = 1 + i * (W - 2) / (n - 1), on = i / (n - 1) <= mo / 12;
      s += `<line x1="${x}" x2="${x}" y1="${i % 6 === 0 ? 2 : 8}" y2="20" stroke="${on ? ACC : 'rgba(255,255,255,.28)'}" stroke-width="1.6" stroke-linecap="round" style="transition:stroke .2s ${i * 14}ms"/>`;
    }
    svg.innerHTML = s + `<text x="${W}" y="0" dy="-4" text-anchor="end" font-size="10" fill="${T3}" font-family="Geist Mono">12 mo</text>`;
  }

  // Pay Card
  const pay = $id('pay');
  const PAY = data.payments.map(p => [p.name, p.date, p.amount, p.name.charAt(0)]);
  function updatePay() {
    pay.innerHTML = `<div class="in-c" style="padding-bottom:14px"><div class="row" style="justify-content:space-between"><div class="cap">Next orders & tickets</div><span class="mono muted">${money(PAY.reduce((a, p) => a + p[2], 0))}</span></div>
      <div style="margin-top:10px">${PAY.map(([n, d, v, l], i) => `<div class="row" style="height:34px;${i ? 'border-top:1px solid rgba(255,255,255,.08)' : ''}"><i style="width:24px;height:24px;border-radius:8px;background:rgba(255,255,255,.1);display:grid;place-items:center;font:600 11px Geist;font-style:normal">${l}</i><span style="flex:1;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n}</span><span class="muted mono" style="font-size:11.5px">${d}</span><span class="mono" style="width:62px;text-align:right;font-size:13px">${money(v)}</span></div>`).join('')}</div></div>`;
  }

  // Goals Card
  const goals = $id('goals');
  const GO = data.goals.map(g => [g.name, g.progress, g.target]);
  function updateGoals() {
    goals.innerHTML = `<div class="in-c"><div class="row" style="justify-content:space-between"><div class="cap">Trader Metas & Budget</div><span class="muted">2 active</span></div>
      ${GO.map(([n, f, v], k) => `<div style="margin-top:${k ? 14 : 16}px"><div class="row" style="justify-content:space-between;font-size:13px;font-weight:600"><span>${n}</span><span class="mono" style="font-weight:500">${Math.round(f * 100)}%<span class="muted"> of ${money(v, { compact: true })}</span></span></div>
        <svg width="100%" height="12" style="margin-top:8px;display:block" class="gl" data-f="${f}" aria-hidden="true"></svg></div>`).join('')}</div>`;
    RAF(() => goals.querySelectorAll('.gl').forEach((svg, k) => {
      const W = svg.getBoundingClientRect().width, n = 40, f = +svg.dataset.f; let s = '';
      for (let i = 0; i < n; i++) {
        const x = 1 + i * (W - 2) / (n - 1), on = i / (n - 1) <= f;
        s += `<line x1="${x}" x2="${x}" y1="${i % 8 === 0 ? 0 : 4}" y2="12" stroke="${on ? ACC : 'rgba(255,255,255,.28)'}" stroke-width="1.6" stroke-linecap="round" style="opacity:0;animation:tk2 .3s ${300 + k * 150 + i * 12}ms forwards"/>`;
      }
      svg.innerHTML = '<style>@keyframes tk2{to{opacity:1}}</style>' + s;
    }));
  }

  // Flow Card
  const flow = $id('flow');
  flow.innerHTML = `${bg(GR.pink)}<div class="in-c">
    <div class="row" style="justify-content:space-between"><div><div class="ttl">Cash flow & Lucro Quant</div><div class="muted" style="margin-top:4px">Net <span class="mono" style="color:${ACC}">+$3,240</span> a month</div></div>
      <div class="legend" style="flex-direction:column;gap:4px;align-items:flex-end"><span><i style="background:#fff"></i>Entradas/Ganhos</span><span><i style="background:#FFD0E6"></i>Execuções/Custos</span></div></div>
    <svg class="fls" style="position:absolute;left:0;bottom:12px" aria-hidden="true"></svg></div><div class="rim"></div>`;
  const MLAB = data.cashflow.months, INC = data.cashflow.income, SPN = data.cashflow.spending;
  let flowRaf = 0;

  function updateFlow(instant) {
    const svg = flow.querySelector('.fls'), W = flow.clientWidth || 400, Hh = 246, L = 44, R = W - 36, mid = Hh / 2, lab = 16, amp = mid - lab - 8, max = 7;
    svg.setAttribute('width', W); svg.setAttribute('height', Hh); svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`);
    const X = i => L + i / (MLAB.length - 1) * (R - L);
    cancelAnimationFrame(flowRaf); const t0 = instant ? -1e6 : performance.now();
    const frame = now => {
      const g = ease(reduce ? 1 : Math.min(1, (now - t0) / 1200));
      const path = (arr, dir) => smoothPath(arr.map((v, i) => [X(i), mid + dir * (lab + v / max * amp * g)]));
      let s = '';
      [0, 2, 4, 6].forEach(v => {
        const u = v / RATE[S.ccy], yT = mid - lab - u / max * amp, yB = mid + lab + u / max * amp;
        s += `<line x1="${L}" x2="${R}" y1="${yT}" y2="${yT}" stroke="${HAIR}"/><line x1="${L}" x2="${R}" y1="${yB}" y2="${yB}" stroke="${HAIR}"/>
          <text x="${L - 12}" y="${yT + 3.5}" text-anchor="end" font-size="10" fill="${T3}" font-family="Geist Mono">${v ? SYM[S.ccy] + v + 'K' : '0'}</text><text x="${L - 12}" y="${yB + 3.5}" text-anchor="end" font-size="10" fill="${T3}" font-family="Geist Mono">${v ? SYM[S.ccy] + v + 'K' : '0'}</text>
          <line x1="${R + 8}" x2="${R + 14}" y1="${yT}" y2="${yT}" stroke="${T3}"/><line x1="${R + 8}" x2="${R + 14}" y1="${yB}" y2="${yB}" stroke="${T3}"/>`;
      });
      MLAB.forEach((m, i) => s += `<text x="${X(i)}" y="${mid + 4}" text-anchor="middle" font-size="10.5" font-weight="500" fill="rgba(255,255,255,.75)" font-family="Geist Mono">${m}</text>`);
      INC.slice().reverse().forEach((a, k) => { const j = 2 - k; s += `<path d="${path(a, -1)}" fill="none" stroke="#fff" stroke-opacity="${[1, 0.55, 0.3][j]}" stroke-width="${j ? 1.6 : 2.4}" stroke-linecap="round"/>`; });
      SPN.slice().reverse().forEach((a, k) => { const j = 2 - k; s += `<path d="${path(a, 1)}" fill="none" stroke="#FFD0E6" stroke-opacity="${[1, 0.55, 0.3][j]}" stroke-width="${j ? 1.6 : 2.4}" stroke-linecap="round"/>`; });
      s += `<line class="hl" y1="10" y2="${Hh - 10}" stroke="#fff" stroke-opacity=".5" opacity="0"/><rect class="hit" x="${L - 10}" width="${R - L + 20}" height="${Hh}" fill="transparent"/>`;
      svg.innerHTML = s;
      const hit = svg.querySelector('.hit'), hl = svg.querySelector('.hl');
      hit.onpointermove = e => {
        const r = svg.getBoundingClientRect(), z = r.width / W, x = (e.clientX - r.left) / z, i = Math.max(0, Math.min(5, Math.round((x - L) / (R - L) * 5)));
        hl.setAttribute('x1', X(i)); hl.setAttribute('x2', X(i)); hl.setAttribute('opacity', 1);
        showTip(r.left + X(i) * z, r.top + (mid - lab - INC[0][i] / max * amp) * z, MLAB[i] + ' 2026', [['Income', money(INC[0][i] * 1000), '#fff'], ['Spending', money(SPN[0][i] * 1000), '#FFD0E6'], ['Saved', money((INC[0][i] - SPN[0][i]) * 1000)]]);
      };
      hit.onpointerleave = () => { hl.setAttribute('opacity', 0); hideTip(); };
      if (g < 1) flowRaf = RAF(frame);
    };
    flowRaf = RAF(frame);
  }

  // Crypto Card with Sparklines
  const cr = $id('crypto');
  const CA = data.crypto.map(a => [a.name, a.symbol, a.share, '', []]);
  cr.innerHTML = `${bg(GR.copper)}<div class="in-c"><div class="row" style="justify-content:space-between"><div class="ttl">Binance Cripto</div><span class="muted">7 days</span></div>
    <div class="row" style="margin-top:14px;align-items:flex-end;justify-content:space-between"><span class="big crv">0</span><span style="padding-bottom:4px"><span class="delta crd"></span><span class="muted"> 24h</span></span></div>
    <div class="crb" style="margin-top:16px"></div>
    <div class="crl" style="position:absolute;left:24px;right:24px;bottom:14px"></div></div><div class="rim"></div>`;

  const OHLC = Object.fromEntries(data.crypto.map(a => [a.symbol, a.ohlc]));
  function candles(t) {
    const d = (OHLC[t] || [[1, 2, 0.5, 1.5]]).map(x => x[3]), W = 96, H = 30, lo = Math.min(...d), hi = Math.max(...d), pad = (hi - lo) * 0.15 || 1, Y = v => H - 3 - (v - lo + pad) / (hi - lo + 2 * pad) * (H - 6);
    const P = d.map((v, i) => [2 + i / (d.length - 1) * (W - 6), Y(v)]), e = P[P.length - 1], up = d[d.length - 1] >= d[0], gid = 'sg' + t;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="${smoothPath(P)}L${e[0]},${H}L${P[0][0]},${H}Z" fill="url(#${gid})"/><path d="${smoothPath(P)}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${e[0]}" cy="${e[1]}" r="3" fill="${up ? ACC : '#fff'}" stroke="rgba(0,0,0,.35)" stroke-width="1"/></svg>`;
  }
  const CHG = data.crypto.map(a => a.change);

  function updateCrypto() {
    const v = nwData[nwData.length - 1].crypto; tween(cr.querySelector('.crv'), v, x => money(x)); cr.querySelector('.crd').textContent = '↑ 2.4%';
    cr.querySelector('.crb').innerHTML = `<div style="display:flex;gap:3px;height:6px">${CA.map(([n, s, f], i) => `<div style="flex:0 0 calc(${f * 100}% - 2px);border-radius:3px;background:rgba(255,255,255,${[0.95, 0.6, 0.32][i]});transform-origin:left;transform:scaleX(0);transition:transform .8s var(--ease) ${0.1 + i * 0.1}s" class="crs"></div>`).join('')}</div>
      <div style="display:flex;gap:3px;margin-top:7px">${CA.map(([n, s, f]) => `<span class="mono muted" style="flex:0 0 calc(${f * 100}% - 2px);font-size:11px;white-space:nowrap">${s} ${Math.round(f * 100)}%</span>`).join('')}</div>`;
    RAF(() => RAF(() => cr.querySelectorAll('.crs').forEach(b => b.style.transform = 'scaleX(1)')));
    cr.querySelector('.crl').innerHTML = CA.map(([n, s, f, c, sp], i) => `<div class="row" style="height:50px;${i ? 'border-top:1px solid rgba(255,255,255,.1)' : ''}">
      <div style="flex:1;min-width:0"><div style="font-size:13.5px;font-weight:600">${n}</div><div class="mono muted" style="font-size:11px">${s} · 7d</div></div>${candles(s)}
      <div style="width:80px;text-align:right"><div class="mono" style="font-size:13px">${money(v * f)}</div><div class="mono" style="font-size:11px;color:${CHG[i].startsWith('+') ? ACC : T3}">${CHG[i]}</div></div></div>`).join('');
  }

  // Stocks Card
  const st = $id('stocks');
  const WK = data.stocks.days, WV = data.stocks.values;
  st.innerHTML = `${bg(GR.green)}<div class="in-c"><div class="ttl">Stocks (US & B3)</div>
    <div style="margin-top:14px"><span class="big stv" style="font-size:34px">0</span></div><div class="row" style="margin-top:6px;gap:8px"><span class="delta">↑ 1.8%</span><span class="muted">this week</span></div>
    <svg class="sts" style="position:absolute;left:18px;bottom:14px" aria-hidden="true"></svg></div><div class="rim"></div>`;

  function updateStocks(instant) {
    const v = nwData[nwData.length - 1].stocks; if (!instant) tween(st.querySelector('.stv'), v, x => money(x));
    const svg = st.querySelector('.sts'), W = (st.clientWidth || 300) - 36, Hh = 160, pb = 18, bw = 22, max = 5, gap = (W - 24 - bw * 5) / 4;
    svg.setAttribute('width', W); svg.setAttribute('height', Hh);
    const Y = x => (Hh - pb) * (1 - x / max); let s = '';
    [0, 2, 4].forEach(t => s += `<text x="0" y="${Y(t) + 3.5}" font-size="9.5" fill="${T3}" font-family="Geist Mono">${t}K</text>`);
    WV.forEach((x, i) => {
      const X = 24 + i * (bw + gap); const today = i === WV.length - 1;
      s += `<rect x="${X}" y="${Y(max)}" width="${bw}" height="${Hh - pb - Y(max)}" rx="${bw / 2}" fill="rgba(0,0,0,.28)"/>
        <rect class="sb" x="${X}" y="${Hh - pb}" width="${bw}" height="0" rx="${bw / 2}" fill="${today ? ACC : '#fff'}" data-y="${Y(x)}" data-h="${Hh - pb - Y(x)}" style="transition:y .8s var(--ease) ${i * 70}ms,height .8s var(--ease) ${i * 70}ms"/>
        <text x="${X + bw / 2}" y="${Hh - 3}" text-anchor="middle" font-size="10" fill="${today ? '#fff' : T3}" font-family="Geist Mono">${WK[i]}</text>
        <rect class="hit" x="${X - 4}" y="0" width="${bw + 8}" height="${Hh}" fill="transparent" data-i="${i}"/>`;
    });
    svg.innerHTML = s;
    RAF(() => RAF(() => svg.querySelectorAll('.sb').forEach(b => { b.setAttribute('y', b.dataset.y); b.setAttribute('height', b.dataset.h); })));
    svg.querySelectorAll('.hit').forEach(h => {
      h.onpointermove = e => { const i = +h.dataset.i; showTip(e.clientX, e.clientY, WK[i] + ' · trading volume', [['Bought', money(WV[i] * 1000 * 0.64), '#fff'], ['Sold', money(WV[i] * 1000 * 0.36)]]); };
      h.onpointerleave = hideTip;
    });
  }

  // Segmented Controls
  function seg(host, items, key) {
    if (!host) return;
    host.innerHTML = items.map(k => `<button type="button" aria-pressed="${S[key] === k}">${k}</button>`).join('');
    host.querySelectorAll('button').forEach(b => b.onclick = () => {
      S[key] = b.textContent; host.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); updateAll();
    });
  }

  seg($id('period'), ['1M', '3M', '1Y', 'All'], 'period');
  seg($id('ccy'), ['USD', 'EUR'], 'ccy');

  function updateAll() {
    updateNW(); updateAlloc(); updateRet(); updateCash(); updatePay(); updateGoals(); updateFlow(); updateCrypto(); updateStocks();
  }

  let rz;
  const ro = new ResizeObserver(() => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (!nwData) return; cancelAnimationFrame(nwRaf); nwGrow = 1;
      drawNW(); updateFlow(true); updateStocks(true); updateCash(); updateGoals();
    }, 120);
  });
  ['nw', 'flow', 'stocks', 'cash'].forEach(id => { const el = $id(id); if (el) ro.observe(el); });

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    if (!alive) return;
    const grid = $id('grid'); if (grid) grid.classList.add('in');
    root.querySelectorAll('.card').forEach((c, i) => c.style.transitionDelay = (i * 60) + 'ms');
    updateAll();
  });

  return () => {
    alive = false; frames.forEach(f => cancelAnimationFrame(f)); ro.disconnect(); clearTimeout(rz);
  };
}
