// ─── Chart Manager — Canvas Overlay Approach ──────────────────

const ChartManager = (() => {
let chart        = null;
let candleSeries = null;
let canvas       = null;
let ctx          = null;
let currentSymbol = null;
let currentTf     = ‘1h’;
let allCandles    = [];
let allFvgs       = [];
let hoveredFvg    = null;
let fvgBoxes      = [];
let showFvgs      = true;
let isLight       = false;
let _rafPending   = false;
let _loadGeneration = 0;
let _pendingOrder   = null;

function _scheduleRedraw() {
if (_rafPending) return;
_rafPending = true;
requestAnimationFrame(() => { _rafPending = false; _redraw(); });
}

// ── Init ──────────────────────────────────────────────────────

function init(containerId) {
const el = document.getElementById(containerId);
if (!el) return;

```
chart = LightweightCharts.createChart(el, _chartOptions(false));
candleSeries = chart.addCandlestickSeries(_candleOptions());

canvas = document.createElement('canvas');
canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:3';
el.style.position = 'relative';
el.appendChild(canvas);
ctx = canvas.getContext('2d');

const ro = new ResizeObserver(() => _resize(el));
ro.observe(el);
_resize(el);

chart.timeScale().subscribeVisibleLogicalRangeChange(() => _scheduleRedraw());
chart.subscribeCrosshairMove(() => _scheduleRedraw());

el.addEventListener('mousemove', (e) => {
  const rect = el.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const hit = fvgBoxes.find(b => mx >= b.x1 && mx <= b.x2 && my >= b.y1 && my <= b.y2);
  const next = hit ? hit.fvg : null;
  if (next !== hoveredFvg) {
    hoveredFvg = next;
    el.style.cursor = next ? 'crosshair' : 'default';
    _scheduleRedraw();
  }
});
el.addEventListener('mouseleave', () => {
  if (hoveredFvg) { hoveredFvg = null; _redraw(); }
});
```

}

// ── Theme ─────────────────────────────────────────────────────

function _chartOptions(light) {
return {
width:  0,
height: 0,
layout: {
background: { type: ‘solid’, color: light ? ‘#f6f8fa’ : ‘#0d1117’ },
textColor:  light ? ‘#57606a’ : ‘#8b949e’,
fontSize:   12,
fontFamily: ‘Inter, sans-serif’,
},
grid: {
vertLines: { color: light ? ‘#eaeef2’ : ‘#161b22’ },
horzLines: { color: light ? ‘#eaeef2’ : ‘#161b22’ },
},
crosshair: {
mode: LightweightCharts.CrosshairMode.Normal,
vertLine: { color: light ? ‘#d0d7de’ : ‘#30363d’, width: 1, labelBackgroundColor: light ? ‘#eaeef2’ : ‘#21262d’ },
horzLine: { color: light ? ‘#d0d7de’ : ‘#30363d’, width: 1, labelBackgroundColor: light ? ‘#eaeef2’ : ‘#21262d’ },
},
rightPriceScale: {
borderColor:  light ? ‘#d0d7de’ : ‘#21262d’,
textColor:    light ? ‘#57606a’ : ‘#8b949e’,
scaleMargins: { top: 0.08, bottom: 0.08 },
},
timeScale: {
borderColor:    light ? ‘#d0d7de’ : ‘#21262d’,
timeVisible:    true,
secondsVisible: false,
barSpacing:     8,
rightOffset:    8,
minBarSpacing:  1,
},
handleScroll: {
mouseWheel:       true,
pressedMouseMove: true,
horzTouchDrag:    true,
vertTouchDrag:    false,
},
handleScale: {
mouseWheel:   true,
pinch:        true,
axisPressedMouseMove: { time: true, price: true },
axisDoubleClickReset: true,
},
};
}

function _candleOptions() {
return {
upColor:         ‘#26a69a’,
downColor:       ‘#ef5350’,
borderUpColor:   ‘#26a69a’,
borderDownColor: ‘#ef5350’,
wickUpColor:     ‘#26a69a’,
wickDownColor:   ‘#ef5350’,
};
}

function setTheme(light) {
isLight = light;
if (!chart) return;
const opts = _chartOptions(light);
delete opts.width;
delete opts.height;
chart.applyOptions(opts);
_redraw();
}

function _resize(el) {
const w = el.clientWidth;
const h = el.clientHeight;
chart.applyOptions({ width: w, height: h });
canvas.width  = w;
canvas.height = h;
_redraw();
}

// ── Load Chart ────────────────────────────────────────────────

async function loadChart(symbol, tf) {
if (!chart) return;
currentSymbol = symbol;
currentTf     = tf;
allFvgs       = [];
_pendingOrder = null;
_showLoading(true);

```
const gen = ++_loadGeneration;

try {
  const tfCfg = CONFIG.TIMEFRAMES[tf];

  // Phase 1: erste 500 Kerzen sofort
  const initialCandles = await Binance.getKlines(symbol, tfCfg.interval, (fullCandles) => {
    // Phase 2: vollständige Daten im Hintergrund
    if (gen !== _loadGeneration) return;
    allCandles    = fullCandles;
    candleSeries.setData(fullCandles);
    allFvgs       = FVG.evaluate(FVG.detect(fullCandles), fullCandles);
    _pendingOrder = _findPendingOrder(allFvgs);
    _redraw();
    _updateStatsBar(allFvgs);
    _updateOrderPanel(_pendingOrder);
    _showLoading(false);
  });

  if (gen !== _loadGeneration) return;

  allCandles = initialCandles;
  candleSeries.setData(initialCandles);
  candleSeries.setMarkers([]);

  // Zoom auf letzte ~120 Kerzen
  const total = initialCandles.length;
  try {
    chart.timeScale().setVisibleLogicalRange({ from: total - 125, to: total + 5 });
  } catch(_) { chart.timeScale().fitContent(); }

  setTimeout(() => _redraw(), 50);

  allFvgs       = FVG.evaluate(FVG.detect(initialCandles), initialCandles);
  _pendingOrder = _findPendingOrder(allFvgs);
  _redraw();
  _updateStatsBar(allFvgs);
  _updateOrderPanel(_pendingOrder);

} catch(e) {
  console.error('Chart load error:', e);
} finally {
  if (gen === _loadGeneration) _showLoading(false);
}
```

}

// ── Pending Order — neueste unfilled FVG ──────────────────────

function _findPendingOrder(fvgs) {
const unfilled = fvgs.filter(f => !f.filled);
if (!unfilled.length) return null;
return unfilled[unfilled.length - 1];
}

// ── Order Panel (unter dem Chart) ────────────────────────────

function _updateOrderPanel(order) {
const panel = document.getElementById(‘order-panel’);
if (!panel) return;

```
if (!order) {
  panel.style.display = 'none';
  return;
}

const isBull    = order.type === 'bull';
const riskPct   = Math.abs(((order.entry - order.sl)  / order.entry) * 100).toFixed(2);
const rewardPct = Math.abs(((order.tp   - order.entry) / order.entry) * 100).toFixed(2);

panel.style.display = 'flex';
panel.innerHTML = `
  <div class="op-header">
    <span class="op-badge ${isBull ? 'bull' : 'bear'}">${isBull ? '▲ LONG' : '▼ SHORT'}</span>
    <span class="op-title">Nächste Limit-Order</span>
    <span class="op-gap">${order.gapPct}% Gap</span>
  </div>
  <div class="op-levels">
    <div class="op-row">
      <span class="op-label">Entry</span>
      <span class="op-value">${_fmt(order.entry)}</span>
      <span class="op-hint">Gap-Mitte</span>
    </div>
    <div class="op-row">
      <span class="op-label">TP</span>
      <span class="op-value green">+${rewardPct}%&nbsp;&nbsp;${_fmt(order.tp)}</span>
      <span class="op-hint">1:3 RR</span>
    </div>
    <div class="op-row">
      <span class="op-label">SL</span>
      <span class="op-value red">−${riskPct}%&nbsp;&nbsp;${_fmt(order.sl)}</span>
      <span class="op-hint">Gap-Kante</span>
    </div>
  </div>
`;
```

}

// ── Redraw ────────────────────────────────────────────────────

function _redraw() {
if (!ctx || !canvas || !chart) {
if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
return;
}
ctx.clearRect(0, 0, canvas.width, canvas.height);
fvgBoxes = [];

```
if (showFvgs && allFvgs.length) {
  const resolved = allFvgs.filter(f => f.filled && f.result !== 'pending');
  const active   = allFvgs.filter(f => f.filled && f.result === 'pending');
  for (const fvg of resolved) _drawTradeBox(fvg, true,  false);
  for (const fvg of active)   _drawTradeBox(fvg, false, true);
}

if (_pendingOrder) _drawLimitOrder(_pendingOrder);
```

}

// ── Draw: Limit Order Box ─────────────────────────────────────

function _drawLimitOrder(fvg) {
const isBull = fvg.type === ‘bull’;
const accent = isBull ? ‘#26a69a’ : ‘#ef5350’;
const yEntry = _priceY(fvg.entry);
const ySL    = _priceY(fvg.sl);
const yTP    = _priceY(fvg.tp);
const xL     = _timeX(fvg.time);
const xR     = _rightEdge() + 60;

```
if (yEntry < -1000 || xL < -1000) return;
const xStart = Math.max(xL, 0);
const boxW   = Math.max(0, xR - xStart);
if (boxW < 2) return;

const tpTop = Math.min(yEntry, yTP);
const tpBot = Math.max(yEntry, yTP);
const slTop = Math.min(yEntry, ySL);
const slBot = Math.max(yEntry, ySL);

ctx.save();

// Zonen
ctx.globalAlpha = 0.12;
ctx.fillStyle = '#26a69a'; ctx.fillRect(xStart, tpTop, boxW, tpBot - tpTop);
ctx.fillStyle = '#ef5350'; ctx.fillRect(xStart, slTop, boxW, slBot - slTop);

// Gestrichelte Umrandung
ctx.globalAlpha = 0.7;
ctx.strokeStyle = accent;
ctx.lineWidth   = 1.5;
ctx.setLineDash([6, 4]);
ctx.strokeRect(xStart, Math.min(yTP, ySL), boxW, Math.abs(yTP - ySL));
ctx.setLineDash([]);

// Entry-Linie
ctx.globalAlpha = 1;
ctx.strokeStyle = accent;
ctx.lineWidth   = 1.5;
ctx.beginPath(); ctx.moveTo(xStart, yEntry); ctx.lineTo(xR, yEntry); ctx.stroke();

// LIMIT Badge
const badgeText = '⏳ LIMIT ' + (isBull ? 'LONG' : 'SHORT');
ctx.font = 'bold 11px Inter, sans-serif';
ctx.textAlign = 'left';
const tw = ctx.measureText(badgeText).width;
const bx = xStart + 6;
const by = Math.min(yTP, ySL) + 6;
ctx.globalAlpha = 0.85;
ctx.fillStyle = accent;
_roundRect(bx, by, tw + 12, 18, 4); ctx.fill();
ctx.globalAlpha = 1;
ctx.fillStyle = '#fff';
ctx.fillText(badgeText, bx + 6, by + 13);

// Preis-Labels rechts
const labelX    = _rightEdge() + 4;
const rewardPct = isBull ? +((fvg.tp - fvg.entry) / fvg.entry * 100).toFixed(2) : +((fvg.entry - fvg.tp) / fvg.entry * 100).toFixed(2);
const riskPct   = isBull ? +((fvg.entry - fvg.sl) / fvg.entry * 100).toFixed(2) : +((fvg.sl - fvg.entry) / fvg.entry * 100).toFixed(2);
_drawTVLabel(labelX, yTP,    _fmt(fvg.tp),    '+' + rewardPct + '%', '#26a69a', true);
_drawTVLabel(labelX, ySL,    _fmt(fvg.sl),    '−' + riskPct  + '%', '#ef5350', true);
_drawTVLabel(labelX, yEntry, _fmt(fvg.entry), 'Entry',               accent,    true);

ctx.restore();
```

}

// ── Draw: Trade Box (abgeschlossene Trades) ───────────────────

function _drawTradeBox(fvg, isOld, isActive) {
const isBull = fvg.type === ‘bull’;
const yEntry = _priceY(fvg.entry);
const ySL    = _priceY(fvg.sl);
const yTP    = _priceY(fvg.tp);
const xL     = fvg.fillTime ? _timeX(fvg.fillTime) : _timeX(fvg.time);
const xR     = (fvg.closeTime && !isActive) ? _timeX(fvg.closeTime) : _rightEdge();

```
if (yEntry < -1000 || xL < -1000 || xL > canvas.width) return;
const xStart = Math.max(xL, 0);
const boxW   = Math.max(0, xR - xStart);
if (boxW < 2) return;

const tpTop = Math.min(yEntry, yTP);
const tpBot = Math.max(yEntry, yTP);
const slTop = Math.min(yEntry, ySL);
const slBot = Math.max(yEntry, ySL);

ctx.save();
ctx.globalAlpha = 0.30;
ctx.fillStyle = '#26a69a'; ctx.fillRect(xStart, tpTop, boxW, tpBot - tpTop);
ctx.fillStyle = '#ef5350'; ctx.fillRect(xStart, slTop, boxW, slBot - slTop);
ctx.globalAlpha = 0.9;
ctx.strokeStyle = isLight ? '#888' : '#d1d4dc';
ctx.lineWidth   = 1;
ctx.setLineDash([4, 3]);
ctx.beginPath(); ctx.moveTo(xStart, yEntry); ctx.lineTo(xR, yEntry); ctx.stroke();
ctx.setLineDash([]);

fvgBoxes.push({ fvg, x1: xStart, x2: xR, y1: Math.min(yTP, ySL), y2: Math.max(yTP, ySL) });

if (hoveredFvg !== fvg) { ctx.restore(); return; }

const labelX = xR + 4;
ctx.globalAlpha = 1;
const tpPct = isBull ? +((fvg.tp - fvg.entry) / fvg.entry * 100).toFixed(2) : +((fvg.entry - fvg.tp) / fvg.entry * 100).toFixed(2);
const slPct = isBull ? +((fvg.entry - fvg.sl) / fvg.entry * 100).toFixed(2) : +((fvg.sl - fvg.entry) / fvg.entry * 100).toFixed(2);
_drawTVLabel(labelX, yTP,    _fmt(fvg.tp),    '+' + tpPct + '%', '#26a69a', fvg.result === 'win');
_drawTVLabel(labelX, ySL,    _fmt(fvg.sl),    '-' + slPct + '%', '#ef5350', fvg.result === 'loss');
_drawTVLabel(labelX, yEntry, _fmt(fvg.entry), 'Entry',           '#d1d4dc', false);

if (fvg.result === 'win' || fvg.result === 'loss') {
  const isWin    = fvg.result === 'win';
  const badgeY   = isWin ? (tpTop + yEntry) / 2 : (slTop + yEntry) / 2;
  const badgeTxt = isWin ? '\u2713  +' + fvg.resultPct + '%' : '\u2717  ' + fvg.resultPct + '%';
  const badgeCol = isWin ? '#26a69a' : '#ef5350';
  const badgeX   = xStart + boxW / 2;
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(badgeTxt).width;
  ctx.globalAlpha = 0.65; ctx.fillStyle = badgeCol;
  _roundRect(badgeX - tw / 2 - 10, badgeY - 11, tw + 20, 20, 5); ctx.fill();
  ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
  ctx.fillText(badgeTxt, badgeX, badgeY + 5);
}

ctx.restore();
```

}

// ── Coordinate Helpers ────────────────────────────────────────

function _priceY(price) {
const y = candleSeries.priceToCoordinate(price);
return y === null ? -9999 : y;
}

function _timeX(unixSec) {
const x = chart.timeScale().timeToCoordinate(unixSec);
return x === null ? -9999 : x;
}

function _rightEdge() { return canvas.width - 80; }

function _fmt(p) {
if (!p) return ‘—’;
if (p >= 1000) return p.toFixed(2);
if (p >= 1)    return p.toFixed(4);
return p.toFixed(6);
}

function _drawTVLabel(x, y, priceText, pctText, color, active) {
ctx.save();
ctx.font = ‘bold 11px Inter, sans-serif’;
ctx.textAlign = ‘left’;
const priceTw = ctx.measureText(priceText).width;
const pad = 5, h = 18, gap = 6;
const totalW = pad + priceTw + gap + ctx.measureText(pctText).width + pad;
ctx.globalAlpha = active ? 0.95 : (color === ‘#d1d4dc’ ? 0.5 : 0.3);
ctx.fillStyle   = color;
_roundRect(x, y - h / 2, totalW, h, 4); ctx.fill();
ctx.globalAlpha = 1;   ctx.fillStyle = ‘#fff’; ctx.fillText(priceText, x + pad, y + 4);
ctx.globalAlpha = 0.8; ctx.fillText(pctText, x + pad + priceTw + gap, y + 4);
ctx.restore();
}

function _roundRect(x, y, w, h, r) {
ctx.beginPath();
ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
ctx.quadraticCurveTo(x + w, y, x + w, y + r);
ctx.lineTo(x + w, y + h - r);
ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
ctx.lineTo(x + r, y + h);
ctx.quadraticCurveTo(x, y + h, x, y + h - r);
ctx.lineTo(x, y + r);
ctx.quadraticCurveTo(x, y, x + r, y);
ctx.closePath();
}

function toggleLabels(btn) {
showLabels = !showLabels;
if (btn) btn.classList.toggle(‘active’, showLabels);
_redraw();
}

function _updateStatsBar(fvgs) {
const filled  = fvgs.filter(f => f.filled);
const wins    = filled.filter(f => f.result === ‘win’).length;
const losses  = filled.filter(f => f.result === ‘loss’).length;
const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : ‘—’;
const perf    = FVG.calcPerformance(fvgs);
_set(‘stat-total’,   fvgs.length);
_set(‘stat-wins’,    wins,   ‘green’);
_set(‘stat-losses’,  losses, ‘red’);
_set(‘stat-winrate’, (wins + losses) > 0 ? winRate + ‘%’ : ‘—’, wins > losses ? ‘green’ : ‘red’);
_set(‘stat-return’,  perf.totalReturn >= 0 ? ‘+’ + perf.totalReturn + ‘%’ : perf.totalReturn + ‘%’, perf.totalReturn >= 0 ? ‘green’ : ‘red’);
}

function _set(id, val, cls) {
const el = document.getElementById(id);
if (!el) return;
el.textContent = val;
if (cls) el.className = ’stat-value ’ + cls;
}

function _showLoading(show) {
const pl = document.getElementById(‘chart-placeholder’);
if (!pl) return;
if (show) { pl.innerHTML = ‘<div class="spinner"></div>’; pl.style.display = ‘flex’; }
else      { pl.style.display = ‘none’; }
}

function getCurrentData() {
return { symbol: currentSymbol, tf: currentTf, candles: allCandles, fvgs: allFvgs };
}

function resetMarkers() {
if (candleSeries) candleSeries.setMarkers([]);
allFvgs       = [];
_pendingOrder = null;
if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
_updateOrderPanel(null);
}

return { init, loadChart, getCurrentData, resetMarkers, toggleLabels, setTheme };
})();
