// ─── Performance Page ─────────────────────────────────────────

let equityChart = null;

document.addEventListener('DOMContentLoaded', () => {
  _initDateDefaults();
  document.getElementById('btn-calc').addEventListener('click', runCalc);
});

function _initDateDefaults() {
  const end   = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);

  document.getElementById('perf-start').value = _isoDate(start);
  document.getElementById('perf-end').value   = _isoDate(end);
}

async function runCalc() {
  const symbolRaw = document.getElementById('perf-symbol').value.trim().toUpperCase();
  const tf        = document.getElementById('perf-tf').value;
  const startVal  = document.getElementById('perf-start').value;
  const endVal    = document.getElementById('perf-end').value;
  const btn       = document.getElementById('btn-calc');

  if (!symbolRaw) { alert('Symbol eingeben (z.B. ETH)'); return; }

  const symbol = symbolRaw.endsWith('USDT') ? symbolRaw : symbolRaw + 'USDT';

  if (!isAltcoin(symbol)) {
    alert(`${symbol} ist kein Altcoin. Nur USDT-Altcoins erlaubt.`);
    return;
  }

  const startMs = new Date(startVal).getTime();
  const endMs   = new Date(endVal).getTime() + 86400000; // include end day

  btn.disabled    = true;
  btn.textContent = 'Berechne…';
  _setLoading(true);

  try {
    const tfConfig = CONFIG.TIMEFRAMES[tf] || CONFIG.TIMEFRAMES['1h'];
    const candles  = await Binance.getKlinesRange(symbol, tfConfig.interval, startMs, endMs);

    if (!candles.length) {
      alert('Keine Daten für diesen Zeitraum.');
      return;
    }

    const fvgs  = FVG.detect(candles);
    const evald = FVG.evaluate(fvgs, candles, tf);

    // Tag each fvg with symbol
    evald.forEach(f => f.symbol = symbol);

    const perf = FVG.calcPerformance(evald);

    _renderKPIs(perf, symbol, tf, startVal, endVal, candles.length);
    _renderEquityChart(perf.equityCurve);
    _renderTradeTable(perf.trades, symbol);

  } catch (e) {
    console.error(e);
    alert('Fehler beim Laden der Daten: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Berechnen';
    _setLoading(false);
  }
}

function _renderKPIs(perf, symbol, tf, start, end, candleCount) {
  const { totalReturn, wins, losses, winRate, pending } = perf;

  _kpi('kpi-return',  (totalReturn >= 0 ? '+' : '') + totalReturn + '%',
                       totalReturn >= 0 ? 'green' : 'red');
  _kpi('kpi-winrate', winRate + '%',
                       winRate >= 50 ? 'green' : 'red');
  _kpi('kpi-trades',  wins + losses + pending, 'neutral');
  _kpi('kpi-wins',    wins, 'green');
  _kpi('kpi-losses',  losses, 'red');
  _kpi('kpi-pending', pending, 'neutral');

  const infoEl = document.getElementById('perf-info');
  if (infoEl) {
    infoEl.style.display = 'block';
    infoEl.textContent =
      `${symbol} · ${tf.toUpperCase()} · ${start} → ${end} · ${candleCount} Kerzen · ` +
      `${wins+losses+pending} FVG-Trades (nur ≥${CONFIG.FVG_MIN_PCT}% Gap, 1:${CONFIG.RR_RATIO} RR) · ${expired} abgelaufen`;
  }
}

function _kpi(id, val, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val;
  el.className   = `kpi-value ${cls}`;
}

function _renderEquityChart(curve) {
  const ctx = document.getElementById('equityChart');
  if (!ctx) return;

  if (equityChart) { equityChart.destroy(); equityChart = null; }

  const labels = curve.map(p => p.label);
  const values = curve.map(p => p.value);
  const colors = curve.map((p, i) => {
    if (i === 0) return 'rgba(88,166,255,0.8)';
    return p.result === 'win' ? 'rgba(63,185,80,0.8)' : 'rgba(248,81,73,0.8)';
  });

  equityChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:            'Equity (%)',
        data:             values,
        borderColor:      '#58a6ff',
        backgroundColor:  'rgba(88,166,255,0.08)',
        borderWidth:       2,
        pointBackgroundColor: colors,
        pointRadius:       4,
        pointHoverRadius:  6,
        fill:              true,
        tension:           0.2,
      }]
    },
    options: {
      responsive:    true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y.toFixed(2)}%`,
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', maxTicksLimit: 10 },
          grid:  { color: '#1c2128' },
        },
        y: {
          ticks: {
            color: '#8b949e',
            callback: v => v + '%',
          },
          grid:  { color: '#1c2128' },
        }
      }
    }
  });
}

function _renderTradeTable(trades, symbol) {
  const tbody = document.getElementById('trade-tbody');
  if (!tbody) return;

  if (!trades.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">Keine Trades in diesem Zeitraum</td></tr>';
    return;
  }

  const sorted = [...trades].sort((a, b) => (b.fillTime || 0) - (a.fillTime || 0));

  tbody.innerHTML = sorted.map((t, i) => {
    const entry  = _fmtP(t.entry);
    const sl     = _fmtP(t.sl);
    const tp     = _fmtP(t.tp);
    const date   = t.fillTime ? new Date(t.fillTime * 1000).toLocaleString('de') : '—';
    const cls    = t.result === 'win' ? 'win' : t.result === 'loss' ? 'loss' : 'pending';
    const resStr = t.result === 'win'  ? `+${t.resultPct}%`
                 : t.result === 'loss' ? `${t.resultPct}%`
                 : 'Offen';

    return `<tr>
      <td>${i + 1}</td>
      <td>${symbol.replace('USDT','')}</td>
      <td><span class="scan-badge ${t.type === 'bull' ? 'bull' : 'bear'}">${t.type === 'bull' ? '▲ Bull' : '▼ Bear'}</span></td>
      <td>${date}</td>
      <td>${entry}</td>
      <td>${sl}</td>
      <td>${tp}</td>
      <td><span class="trade-result ${cls}">${resStr}</span></td>
    </tr>`;
  }).join('');
}

function _setLoading(show) {
  const el = document.getElementById('perf-loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function _isoDate(d) {
  return d.toISOString().split('T')[0];
}

function _fmtP(p) {
  if (!p) return '—';
  if (p >= 1000) return p.toFixed(2);
  if (p >= 1)    return p.toFixed(4);
  return p.toFixed(6);
}
