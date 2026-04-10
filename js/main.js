// ─── Main — index.html entry point ────────────────────────────

let currentTf = '1h';
let tickerWs  = null;

document.addEventListener('DOMContentLoaded', () => {

  // Init chart
  ChartManager.init('chart');

  // Apply saved theme to chart immediately after init
  const savedTheme = localStorage.getItem('fvg_theme');
  if (savedTheme === 'light') ChartManager.setTheme(true);

  // Init watchlist
  Watchlist.init((symbol) => {
    _loadSymbol(symbol);
  });

  // Timeframe buttons
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTf = btn.dataset.tf;
      const sym = Watchlist.getActive();
      if (sym) _loadSymbol(sym);
    });
  });

  // Check if redirected from trades.html
  const gotoSym = sessionStorage.getItem('goto_symbol');
  const gotoTf  = sessionStorage.getItem('goto_tf');
  if (gotoSym) {
    sessionStorage.removeItem('goto_symbol');
    sessionStorage.removeItem('goto_tf');
    // Set TF button
    if (gotoTf) {
      document.querySelectorAll('.tf-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tf === gotoTf);
      });
      currentTf = gotoTf;
    }
    // Add to watchlist if needed, then select
    setTimeout(() => {
      try { Watchlist.add(gotoSym); } catch(_) {}
      Watchlist.select(gotoSym);
    }, 300);
  } else {
    // Auto-select first watchlist item
    setTimeout(() => {
      const first = document.querySelector('.watchlist-item');
      if (first) first.click();
    }, 200);
  }
});

async function _loadSymbol(symbol) {
  // Update toolbar
  const base = symbol.replace('USDT', '');
  document.getElementById('chart-symbol').textContent = `${base} / USDT`;
  const lbl = document.getElementById('navbar-sym-label');
  if (lbl) lbl.textContent = `${base}/USDT`;

  // Fetch initial price + change immediately via REST
  try {
    const ticker = await Binance.getTicker(symbol);
    const priceEl  = document.getElementById('navbar-price');
    const changeEl = document.getElementById('navbar-change');
    if (priceEl && ticker.lastPrice)  priceEl.textContent = _fmt(parseFloat(ticker.lastPrice));
    if (changeEl && ticker.priceChangePercent != null) {
      const ch = parseFloat(ticker.priceChangePercent);
      changeEl.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
      changeEl.className   = 'ticker-change ' + (ch >= 0 ? 'up' : 'down');
    }
  } catch(_) {}

  // Reset markers for fresh render
  ChartManager.resetMarkers();

  // Load chart
  await ChartManager.loadChart(symbol, currentTf);

  // Live ticker
  _startTicker(symbol);
}

function _startTicker(symbol) {
  if (tickerWs) { tickerWs.close(); tickerWs = null; }

  tickerWs = Binance.subscribeTicker(symbol, ({ price, change }) => {
    const priceEl  = document.getElementById('navbar-price');
    const changeEl = document.getElementById('navbar-change');
    if (priceEl && !isNaN(price))  priceEl.textContent = _fmt(price);
    if (changeEl && !isNaN(change)) {
      changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
      changeEl.className   = 'ticker-change ' + (change >= 0 ? 'up' : 'down');
    }
  });
}

// _fmt() is defined globally in config.js
