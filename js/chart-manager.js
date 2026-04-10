// ─── Chart Manager — Canvas Overlay Approach ──────────────────

const ChartManager = (() => {
  let chart        = null;
  let candleSeries = null;
  let canvas       = null;
  let ctx          = null;
  let currentSymbol = null;
  let currentTf     = '1h';
  let allCandles    = [];
  let allFvgs       = [];
  let hoveredFvg    = null;   // FVG the mouse is currently over
  let fvgBoxes      = [];     // [{fvg, x1, x2, y1, y2}] for hit-testing
  let showFvgs      = true;   // toggle FVG visibility
  let isLight       = false;  // current theme
  let _rafPending   = false;  // requestAnimationFrame throttle

  function _scheduleRedraw() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => { _rafPending = false; _redraw(); });
  }

  // ── Init ──────────────────────────────────────────────────────

  function init(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    chart = LightweightCharts.createChart(el, _chartOptions(false));

    candleSeries = chart.addCandlestickSeries(_candleOptions(false));

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

    // Hover hit-testing on chart container
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
  }

  // ── Theme Helpers ─────────────────────────────────────────────

  function _chartOptions(light) {
    return {
      width:  0,
      height: 0,
      layout: {
        background: { type: 'solid', color: light ? '#f6f8fa' : '#0d1117' },
        textColor:  light ? '#57606a' : '#8b949e',
        fontSize:   12,
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: light ? '#eaeef2' : '#161b22' },
        horzLines: { color: light ? '#eaeef2' : '#161b22' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: light ? '#d0d7de' : '#30363d', width: 1, labelBackgroundColor: light ? '#eaeef2' : '#21262d' },
        horzLine: { color: light ? '#d0d7de' : '#30363d', width: 1, labelBackgroundColor: light ? '#eaeef2' : '#21262d' },
      },
      rightPriceScale: {
        borderColor:  light ? '#d0d7de' : '#21262d',
        textColor:    light ? '#57606a' : '#8b949e',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor:    light ? '#d0d7de' : '#21262d',
        timeVisible:    true,
        secondsVisible: false,
        barSpacing:     8,
        rightOffset:    8,
      },
      handleScroll:  { mouseWheel: true, pressedMouseMove: true },
      handleScale:   { mouseWheel: true, pinch: true },
    };
  }

  function _candleOptions(light) {
    // Always true green/red regardless of theme
    return {
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    };
  }

  function setTheme(light) {
    isLight = light;
    if (!chart) return;
    const opts = _chartOptions(light);
    // Remove size from applyOptions (managed by resize)
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
    _showLoading(true);

    try {
      const tfCfg   = CONFIG.TIMEFRAMES[tf];
      const candles = await Binance.getKlines(symbol, tfCfg.interval);
      allCandles = candles;

      candleSeries.setData(candles);
      candleSeries.setMarkers([]);
      chart.timeScale().fitContent();
      setTimeout(() => _redraw(), 50);
      setTimeout(() => _redraw(), 200);

      const fvgs = FVG.detect(candles);
      allFvgs    = FVG.evaluate(fvgs, candles);

      _redraw();
      _updateStatsBar(allFvgs);

    } catch (e) {
      console.error('Chart load error:', e);
    } finally {
      _showLoading(false);
    }
  }

  // ── Redraw ────────────────────────────────────────────────────

  function _redraw() {
    if (!ctx || !canvas || !chart) {
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showFvgs || !allFvgs.length) {
      fvgBoxes = [];
      return;
    }

    // 3 Zustände:
    // 1) resolved  — abgeschlossen (win/loss)      → dimmed Trade-Box
    // 2) active    — Trade läuft (filled+pending)  → volle Trade-Box mit SL/TP
    // 3) notFilled — Gap unberührt                 → einfache Gap-Zone
    const resolved  = allFvgs.filter(f => f.filled && f.result !== 'pending');
    const active    = allFvgs.filter(f => f.filled && f.result === 'pending');

    fvgBoxes = [];
    for (const fvg of resolved)  _drawTradeBox(fvg, true,  false);
    for (const fvg of active)    _drawTradeBox(fvg, false, true);
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

  function _rightEdge() {
    return canvas.width - 80;
  }

  // ── Draw: plain FVG zone (not yet triggered) ──────────────────

  function _drawFvgZone(fvg) {
    const isBull = fvg.type === 'bull';
    const yTop   = _priceY(fvg.gapTop);
    const yBot   = _priceY(fvg.gapBot);
    const xL     = _timeX(fvg.time);
    const xR     = _rightEdge();

    if (yTop < -1000 || xL < -1000) return;
    if (xL > canvas.width) return;

    const xStart = Math.max(xL, 0);
    const h      = Math.abs(yBot - yTop);
    if (h < 1) return;

    ctx.save();

    // Zone fill — Blue for all FVG zones
    ctx.globalAlpha = 0.15;
    ctx.fillStyle   = '#2196f3';
    ctx.fillRect(xStart, Math.min(yTop, yBot), Math.max(0, xR - xStart), h);
    ctx.globalAlpha = 1;

    // Top border (solid)
    ctx.strokeStyle = 'rgba(33,150,243,0.9)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xStart, yTop);
    ctx.lineTo(xR, yTop);
    ctx.stroke();

    // Bottom border (dashed)
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xStart, yBot);
    ctx.lineTo(xR, yBot);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  // ── Draw: Trade Box (TradingView Long/Short Tool Style) ───────

  function _drawTradeBox(fvg, isOld, isActive) {
    const isBull  = fvg.type === 'bull';
    const alpha   = 1.0;  // gleiche Sichtbarkeit für alte und aktive Trades

    const yEntry  = _priceY(fvg.entry);
    const ySL     = _priceY(fvg.sl);
    const yTP     = _priceY(fvg.tp);

    // Box beginnt am Entry (fillTime), endet am Close (closeTime) oder rechter Rand
    const xL = fvg.fillTime ? _timeX(fvg.fillTime) : _timeX(fvg.time);
    const xR = (fvg.closeTime && !isActive)
      ? _timeX(fvg.closeTime)
      : _rightEdge();

    if (yEntry < -1000 || xL < -1000) return;
    if (xL > canvas.width) return;

    const xStart = Math.max(xL, 0);
    const boxW   = Math.max(0, xR - xStart);
    if (boxW < 2) return;

    const tpTop = Math.min(yEntry, yTP);
    const tpBot = Math.max(yEntry, yTP);
    const tpH   = tpBot - tpTop;
    const slTop = Math.min(yEntry, ySL);
    const slBot = Math.max(yEntry, ySL);
    const slH   = slBot - slTop;

    ctx.save();

    // ── TP zone fill (green) ──────────────────────────────────
    ctx.globalAlpha = alpha * 0.30;
    ctx.fillStyle   = '#26a69a';
    ctx.fillRect(xStart, tpTop, boxW, tpH);

    // ── SL zone fill (red) ───────────────────────────────────
    ctx.fillStyle   = '#ef5350';
    ctx.fillRect(xStart, slTop, boxW, slH);

    // ── Entry line (solid, separates TP and SL) ───────────────
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = isLight ? '#888' : '#d1d4dc';
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(xStart, yEntry);
    ctx.lineTo(xR, yEntry);
    ctx.stroke();
    ctx.setLineDash([]);

    // Store box bounds for hover hit-testing
    fvgBoxes.push({ fvg, x1: xStart, x2: xR, y1: Math.min(yTP, ySL), y2: Math.max(yTP, ySL) });

    // ── TV-Style Labels — only when this trade is hovered ─────────
    if (hoveredFvg !== fvg) { ctx.restore(); return; }
    {
      const labelX = xR + 4;
      ctx.globalAlpha = alpha;

      // TP: show price + %
      const tpPct = isBull
        ? +((fvg.tp - fvg.entry) / fvg.entry * 100).toFixed(2)
        : +((fvg.entry - fvg.tp) / fvg.entry * 100).toFixed(2);
      _drawTVLabel(labelX, yTP, _fmt(fvg.tp), '+' + tpPct + '%', '#26a69a', fvg.result === 'win');

      // SL: show price + %
      const slPct = isBull
        ? +((fvg.entry - fvg.sl) / fvg.entry * 100).toFixed(2)
        : +((fvg.sl - fvg.entry) / fvg.entry * 100).toFixed(2);
      _drawTVLabel(labelX, ySL, _fmt(fvg.sl), '-' + slPct + '%', '#ef5350', fvg.result === 'loss');

      // Entry: white label
      _drawTVLabel(labelX, yEntry, _fmt(fvg.entry), 'Entry', '#d1d4dc', false);

      // Result badge (center of winning/losing zone)
      if (fvg.result === 'win' || fvg.result === 'loss') {
        const isWin    = fvg.result === 'win';
        const badgeY   = isWin ? (tpTop + yEntry) / 2 : (slTop + yEntry) / 2;
        const badgeTxt = isWin
          ? '\u2713  +' + fvg.resultPct + '%'
          : '\u2717  '  + fvg.resultPct + '%';
        const badgeCol = isWin ? '#26a69a' : '#ef5350';
        const badgeX   = xStart + boxW / 2;

        ctx.font      = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(badgeTxt).width;

        ctx.globalAlpha = alpha * 0.65;
        ctx.fillStyle   = badgeCol;
        _roundRect(badgeX - tw / 2 - 10, badgeY - 11, tw + 20, 20, 5);
        ctx.fill();

        ctx.globalAlpha = alpha;
        ctx.fillStyle   = '#fff';
        ctx.fillText(badgeTxt, badgeX, badgeY + 5);
      }
    }

    ctx.restore();
  }

  // ── Price format helper ─────────────────────────────────────

  function _fmt(p) {
    if (!p) return '—';
    if (p >= 1000) return p.toFixed(2);
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(6);
  }

  // ── TV-Style Label: price left, % right ──────────────────────
  // Renders a pill with two parts like TradingView's position tool

  function _drawTVLabel(x, y, priceText, pctText, color, active) {
    ctx.save();
    ctx.font      = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';

    const priceTw = ctx.measureText(priceText).width;
    const pctTw   = ctx.measureText(pctText).width;
    const pad     = 5;
    const h       = 18;
    const gap     = 6;
    const totalW  = pad + priceTw + gap + pctTw + pad;
    const bx      = x;
    const by      = y - h / 2;

    // Background pill
    ctx.globalAlpha = active ? 0.95 : (color === '#d1d4dc' ? 0.5 : 0.3);
    ctx.fillStyle   = color;
    _roundRect(bx, by, totalW, h, 4);
    ctx.fill();

    // Price text (white)
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(priceText, bx + pad, y + 4);

    // Pct text (slightly dimmer)
    ctx.globalAlpha = 0.8;
    ctx.fillText(pctText, bx + pad + priceTw + gap, y + 4);

    ctx.restore();
  }

  // ── Label badge helper (legacy, kept for safety) ──────────────

  function _drawLabel(x, y, text, color, active) {
    ctx.save();
    const fontSize = 11;
    ctx.font      = 'bold ' + fontSize + 'px Inter, sans-serif';
    ctx.textAlign = 'left';

    const tw  = ctx.measureText(text).width;
    const pad = 6;
    const h   = 18;
    const bx  = x;
    const by  = y - h / 2;

    ctx.fillStyle   = color;
    ctx.globalAlpha = active ? 0.95 : 0.35;
    _roundRect(bx, by, tw + pad * 2, h, 4);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(text, bx + pad, y + fontSize / 2 - 1);

    ctx.restore();
  }

  function _roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ── Toggle Labels ─────────────────────────────────────────────

  function toggleLabels(btn) {
    showLabels = !showLabels;
    if (btn) {
      btn.classList.toggle('active', showLabels);
      btn.title = showLabels ? 'Labels ausblenden' : 'Labels einblenden';
    }
    _redraw();
  }

  // ── Stats Bar ─────────────────────────────────────────────────

  function _updateStatsBar(fvgs) {
    const filled  = fvgs.filter(f => f.filled);
    const wins    = filled.filter(f => f.result === 'win').length;
    const losses  = filled.filter(f => f.result === 'loss').length;
    const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : '—';
    const perf    = FVG.calcPerformance(fvgs);

    _set('stat-total',   fvgs.length);
    _set('stat-wins',    wins,   'green');
    _set('stat-losses',  losses, 'red');
    _set('stat-winrate', (wins + losses) > 0 ? winRate + '%' : '—',
         wins > losses ? 'green' : 'red');
    _set('stat-return',
         perf.totalReturn >= 0 ? '+' + perf.totalReturn + '%' : perf.totalReturn + '%',
         perf.totalReturn >= 0 ? 'green' : 'red');
  }

  function _set(id, val, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    if (cls) el.className = 'stat-value ' + cls;
  }

  // ── Loading ───────────────────────────────────────────────────

  function _showLoading(show) {
    const pl = document.getElementById('chart-placeholder');
    if (!pl) return;
    if (show) {
      pl.innerHTML = '<div class="spinner"></div>';
      pl.style.display = 'flex';
    } else {
      pl.style.display = 'none';
    }
  }

  // ── Public ────────────────────────────────────────────────────

  function getCurrentData() {
    return { symbol: currentSymbol, tf: currentTf, candles: allCandles, fvgs: allFvgs };
  }

  function resetMarkers() {
    if (candleSeries) candleSeries.setMarkers([]);
    allFvgs = [];
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { init, loadChart, getCurrentData, resetMarkers, toggleLabels, setTheme };
})();
