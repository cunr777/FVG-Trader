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
  let showLabels    = false;   // toggled by toolbar button

  // ── Init ──────────────────────────────────────────────────────

  function init(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;

    chart = LightweightCharts.createChart(el, {
      width:  el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: 'solid', color: '#0d1117' },
        textColor:  '#8b949e',
        fontSize:   12,
        fontFamily: 'Inter, sans-serif',
      },
      grid: {
        vertLines: { color: '#161b22' },
        horzLines: { color: '#161b22' },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: { color: '#30363d', width: 1, labelBackgroundColor: '#21262d' },
        horzLine: { color: '#30363d', width: 1, labelBackgroundColor: '#21262d' },
      },
      rightPriceScale: {
        borderColor:  '#21262d',
        textColor:    '#8b949e',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor:    '#21262d',
        timeVisible:    true,
        secondsVisible: false,
        barSpacing:     8,
        rightOffset:    8,
      },
      handleScroll:  { mouseWheel: true, pressedMouseMove: true },
      handleScale:   { mouseWheel: true, pinch: true },
    });

    candleSeries = chart.addCandlestickSeries({
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    });

    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:3';
    el.style.position = 'relative';
    el.appendChild(canvas);
    ctx = canvas.getContext('2d');

    const ro = new ResizeObserver(() => _resize(el));
    ro.observe(el);
    _resize(el);

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => _redraw());
    chart.subscribeCrosshairMove(() => _redraw());
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
      const candles = await Binance.getKlines(symbol, tfCfg.interval, tfCfg.limit);
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
    if (!ctx || !canvas || !chart || !allFvgs.length) {
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 3 Zustände:
    // 1) resolved  — abgeschlossen (win/loss)      → dimmed Trade-Box
    // 2) active    — Trade läuft (filled+pending)  → volle Trade-Box mit SL/TP
    // 3) notFilled — Gap unberührt                 → einfache Gap-Zone
    const resolved  = allFvgs.filter(f => f.filled && f.result !== 'pending');
    const active    = allFvgs.filter(f => f.filled && f.result === 'pending');
    const notFilled = allFvgs.filter(f => !f.filled);

    for (const fvg of resolved)  _drawTradeBox(fvg, true,  false);
    for (const fvg of active)    _drawTradeBox(fvg, false, true);
    for (const fvg of notFilled) _drawFvgZone(fvg);
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

    // Zone fill
    ctx.globalAlpha = 0.18;
    ctx.fillStyle   = isBull ? '#26a69a' : '#ef5350';
    ctx.fillRect(xStart, Math.min(yTop, yBot), Math.max(0, xR - xStart), h);
    ctx.globalAlpha = 1;

    // Top border (solid)
    ctx.strokeStyle = isBull ? 'rgba(38,166,154,0.8)' : 'rgba(239,83,80,0.8)';
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
    const alpha   = isOld ? 0.35 : 1.0;

    const yEntry  = _priceY(fvg.entry);
    const ySL     = _priceY(fvg.sl);
    const yTP     = _priceY(fvg.tp);

    const xL      = _timeX(fvg.time);
    // Active trades extend to right edge; resolved trades end after fill candle
    const fillEnd = isActive
      ? _rightEdge()
      : (fvg.fillTime ? _timeX(fvg.fillTime) + 40 : _rightEdge());
    const xR      = Math.min(fillEnd, _rightEdge());

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

    // TP zone (green)
    ctx.globalAlpha = alpha * 0.38;
    ctx.fillStyle   = '#26a69a';
    ctx.fillRect(xStart, tpTop, boxW, tpH);

    // SL zone (red)
    ctx.fillStyle   = '#ef5350';
    ctx.fillRect(xStart, slTop, boxW, slH);
    ctx.globalAlpha = 1;

    // TP border
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#26a69a';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xStart, yTP);
    ctx.lineTo(xR, yTP);
    ctx.stroke();

    // SL border
    ctx.strokeStyle = '#ef5350';
    ctx.beginPath();
    ctx.moveTo(xStart, ySL);
    ctx.lineTo(xR, ySL);
    ctx.stroke();

    // Entry line (dashed white)
    ctx.strokeStyle = '#d1d4dc';
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(xStart, yEntry);
    ctx.lineTo(xR, yEntry);
    ctx.stroke();
    ctx.setLineDash([]);

    // Left edge bar
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = isBull ? '#26a69a' : '#ef5350';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(xStart, Math.min(yTP, ySL));
    ctx.lineTo(xStart, Math.max(yTP, ySL));
    ctx.stroke();

    // FVG gap highlight (subtle inner zone)
    ctx.globalAlpha = alpha * 0.2;
    ctx.fillStyle   = isBull ? '#26a69a' : '#ef5350';
    ctx.fillRect(xStart,
      Math.min(_priceY(fvg.gapTop), _priceY(fvg.gapBot)),
      boxW,
      Math.abs(_priceY(fvg.gapTop) - _priceY(fvg.gapBot)));

    // ── Labels — only visible when showLabels is enabled ──────
    if (showLabels) {
      const labelX = xR + 4;
      ctx.globalAlpha = alpha;

      const tpPct = isBull
        ? +((fvg.tp - fvg.entry) / fvg.entry * 100).toFixed(2)
        : +((fvg.entry - fvg.tp) / fvg.entry * 100).toFixed(2);
      _drawLabel(labelX, yTP, '+' + tpPct + '%', '#26a69a', fvg.result === 'win');

      const slPct = isBull
        ? +((fvg.entry - fvg.sl) / fvg.entry * 100).toFixed(2)
        : +((fvg.sl - fvg.entry) / fvg.entry * 100).toFixed(2);
      _drawLabel(labelX, ySL, '-' + slPct + '%', '#ef5350', fvg.result === 'loss');

      ctx.font      = 'bold 11px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText('Entry', labelX, yEntry + 4);

      // Result badge (center of zone)
      if (fvg.result === 'win' || fvg.result === 'loss') {
        const isWin    = fvg.result === 'win';
        const badgeY   = isWin ? (tpTop + yEntry) / 2 : (slTop + yEntry) / 2;
        const badgeTxt = isWin
          ? '\u2713  +' + fvg.resultPct + '%'
          : '\u2717  '  + fvg.resultPct + '%';
        const badgeCol = isWin ? '#26a69a' : '#ef5350';
        const badgeX   = xStart + boxW / 2;

        ctx.font      = 'bold 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(badgeTxt).width;

        ctx.globalAlpha = alpha * 0.6;
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

  // ── Label badge helper ────────────────────────────────────────

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

  return { init, loadChart, getCurrentData, resetMarkers, toggleLabels };
})();
