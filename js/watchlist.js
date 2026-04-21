// ─── Watchlist Manager ────────────────────────────────────────

const Watchlist = (() => {
const STORAGE_KEY = ‘fvg_watchlist’;
let items = [];
let activeSymbol = null;
let onSelectCb = null;

function init(onSelect) {
onSelectCb = onSelect;
_load();
_render();
_setupSearch();
_startPriceFeed();
}

function _load() {
try {
const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
items = Array.isArray(saved) ? saved : […CONFIG.DEFAULT_WATCHLIST];
} catch { items = […CONFIG.DEFAULT_WATCHLIST]; }
}

function _save() {
localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function add(symbol) {
const s = symbol.toUpperCase().trim();
if (!s.endsWith(‘USDT’)) return { ok: false, reason: ‘not-altcoin’ };
if (!isAltcoin(s))       return { ok: false, reason: ‘not-altcoin’ };
if (items.includes(s))   return { ok: false, reason: ‘duplicate’ };
items.push(s);
_save();
_render();
_startPriceFeed();
return { ok: true };
}

function remove(symbol) {
items = items.filter(i => i !== symbol);
_save();
_render();
}

function _render() {
const list = document.getElementById(‘watchlist’);
if (!list) return;

```
if (!items.length) {
  list.innerHTML = `
    <div class="wl-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <rect x="9" y="3" width="6" height="4" rx="1"/>
      </svg>
      <p>Watchlist leer.<br>Altcoin oben suchen.</p>
    </div>`;
  return;
}

list.innerHTML = items.map(s => {
  const base     = s.replace('USDT', '');
  const isActive = s === activeSymbol;
  return `
    <div class="watchlist-item ${isActive ? 'active' : ''}" data-symbol="${s}" onclick="Watchlist.select('${s}')">
      <div class="wl-icon">${base.slice(0, 3)}</div>
      <div class="wl-info">
        <div class="wl-symbol">${base}<span style="font-size:10px;color:var(--text-muted)">/USDT</span></div>
        <div class="wl-name" id="wl-name-${s}">—</div>
      </div>
      <div class="wl-price-wrap">
        <div class="wl-price"  id="wl-price-${s}">—</div>
        <div class="wl-change" id="wl-change-${s}">—</div>
      </div>
      <button class="wl-remove" onclick="event.stopPropagation(); Watchlist.remove('${s}')" title="Entfernen">✕</button>
    </div>`;
}).join('');

_fetchPrices();
```

}

async function _fetchPrices() {
for (const sym of items) {
try {
const t = await Binance.getTicker(sym);
_updateItem(sym, parseFloat(t.lastPrice), parseFloat(t.priceChangePercent));
} catch {}
}
}

function _updateItem(sym, price, changePct) {
const priceEl  = document.getElementById(`wl-price-${sym}`);
const changeEl = document.getElementById(`wl-change-${sym}`);
if (priceEl)  priceEl.textContent  = _fmt(price);
if (changeEl) {
changeEl.textContent = (changePct >= 0 ? ‘+’ : ‘’) + changePct.toFixed(2) + ‘%’;
changeEl.className   = ’wl-change ’ + (changePct >= 0 ? ‘up’ : ‘down’);
}
}

function _startPriceFeed() {
clearInterval(Watchlist._priceTimer);
Watchlist._priceTimer = setInterval(_fetchPrices, 10000);
}

function _setupSearch() {
const input  = document.getElementById(‘watchlist-search’);
const errEl  = document.getElementById(‘search-error’);
const hintEl = document.getElementById(‘search-hint’);
if (!input) return;

```
input.addEventListener('keydown', async (e) => {
  if (e.key !== 'Enter') return;
  const val = input.value.trim().toUpperCase();
  if (!val) return;
  const symbol = val.endsWith('USDT') ? val : val + 'USDT';
  errEl.style.display = hintEl.style.display = 'none';

  if (!isAltcoin(symbol)) {
    errEl.textContent = symbol.replace('USDT','') + ' ist kein Altcoin (nur USDT-Altcoins erlaubt)';
    errEl.style.display = 'block';
    return;
  }
  try { await Binance.getPrice(symbol); }
  catch {
    errEl.textContent = `"${symbol}" nicht auf Binance gefunden.`;
    errEl.style.display = 'block';
    return;
  }
  const res = add(symbol);
  if (!res.ok) {
    if (res.reason === 'duplicate') {
      hintEl.textContent  = `${symbol} ist bereits in der Watchlist.`;
      hintEl.style.display = 'block';
    }
    return;
  }
  input.value = '';
  select(symbol);
});
```

}

function select(symbol) {
activeSymbol = symbol;

```
document.querySelectorAll('.watchlist-item').forEach(el => {
  el.classList.toggle('active', el.dataset.symbol === symbol);
});

// Auf Mobile zum Chart scrollen
if (window.innerWidth <= 768) {
  const t = document.querySelector('.chart-area') || document.getElementById('chart');
  if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Grüner Glow-Puls
const chartArea = document.querySelector('.chart-area');
if (chartArea) {
  chartArea.classList.remove('chart-pulse');
  void chartArea.offsetWidth;
  chartArea.classList.add('chart-pulse');
  setTimeout(() => chartArea.classList.remove('chart-pulse'), 600);
}

if (onSelectCb) onSelectCb(symbol);
```

}

function getActive() { return activeSymbol; }

return { init, add, remove, select, getActive };
})();
