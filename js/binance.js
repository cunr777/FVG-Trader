// ─── Binance API Wrapper ───────────────────────────────────────

const Binance = (() => {
  const BASE = CONFIG.BINANCE_BASE;
  const cache = new Map();

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Get klines (OHLCV) — paginiert, bis zu 2 Jahre
  async function getKlines(symbol, interval) {
    const allCandles  = [];
    const limit       = 1000;
    const now         = Date.now();
    const maxLookback = 2 * 365 * 24 * 60 * 60 * 1000;
    const cutoff      = now - maxLookback;
    let   endTime     = now;
    let   pages       = 0;
    const maxPages    = 20; // Sicherheitsgrenze

    while (pages < maxPages) {
      const url = `${BASE}/klines?symbol=${symbol}&interval=${interval}&endTime=${endTime}&limit=${limit}`;
      let raw;
      try { raw = await fetchJSON(url); } catch(e) { break; }
      if (!raw || !raw.length) break;

      const candles = raw.map(k => ({
        time:   Math.floor(k[0] / 1000),
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
      allCandles.unshift(...candles);
      pages++;

      if (raw.length < limit) break;
      endTime = raw[0][0] - 1;
      if (endTime < cutoff) break;

      // Kurze Pause um Rate-Limit zu vermeiden
      await new Promise(r => setTimeout(r, 80));
    }

    const seen = new Set();
    return allCandles
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time);
  }

  // Get klines for a date range (for performance page)
  async function getKlinesRange(symbol, interval, startTime, endTime) {
    const allCandles = [];
    let from = startTime;
    const limit = 1000;

    while (from < endTime) {
      const url = `${BASE}/klines?symbol=${symbol}&interval=${interval}&startTime=${from}&endTime=${endTime}&limit=${limit}`;
      const raw = await fetchJSON(url);
      if (!raw.length) break;
      raw.forEach(k => {
        allCandles.push({
          time:   Math.floor(k[0] / 1000),
          open:   parseFloat(k[1]),
          high:   parseFloat(k[2]),
          low:    parseFloat(k[3]),
          close:  parseFloat(k[4]),
          volume: parseFloat(k[5]),
        });
      });
      if (raw.length < limit) break;
      from = raw[raw.length - 1][6] + 1; // closeTime + 1ms
    }
    return allCandles;
  }

  // Get 24h ticker
  async function getTicker(symbol) {
    const url = `${BASE}/ticker/24hr?symbol=${symbol}`;
    return fetchJSON(url);
  }

  // Get price
  async function getPrice(symbol) {
    const url = `${BASE}/ticker/price?symbol=${symbol}`;
    return fetchJSON(url);
  }

  // Get all USDT trading pairs
  async function getUSDTPairs() {
    const url = `${BASE}/exchangeInfo`;
    const data = await fetchJSON(url);
    return data.symbols
      .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
      .map(s => s.symbol);
  }

  // WebSocket for live price
  function subscribeTicker(symbol, onUpdate) {
    const ws = new WebSocket(`${CONFIG.BINANCE_WS}/${symbol.toLowerCase()}@miniTicker`);
    ws.onmessage = (e) => {
      const d      = JSON.parse(e.data);
      const price  = parseFloat(d.c);
      const change = parseFloat(d.P);
      if (!isNaN(price) && !isNaN(change)) onUpdate({ price, change });
    };
    return ws;
  }

  return { getKlines, getKlinesRange, getTicker, getPrice, getUSDTPairs, subscribeTicker };
})();
