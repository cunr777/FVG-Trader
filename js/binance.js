// ─── Binance API Wrapper ───────────────────────────────────────

const Binance = (() => {
const BASE = CONFIG.BINANCE_BASE;
const cache = new Map();

async function fetchJSON(url) {
const res = await fetch(url);
if (!res.ok) throw new Error(`HTTP ${res.status}`);
return res.json();
}

async function getKlines(symbol, interval, onMore) {
const url500 = `${BASE}/klines?symbol=${symbol}&interval=${interval}&limit=500`;
let initial;
try { initial = await fetchJSON(url500); } catch(e) { return []; }
if (!initial || !initial.length) return [];

```
const toCandle = k => ({
  time:   Math.floor(k[0] / 1000),
  open:   parseFloat(k[1]),
  high:   parseFloat(k[2]),
  low:    parseFloat(k[3]),
  close:  parseFloat(k[4]),
  volume: parseFloat(k[5]),
});

const firstBatch = initial.map(toCandle);

if (onMore) {
  (async () => {
    const allCandles = [...firstBatch];
    const limit      = 1000;
    const cutoff     = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000;
    let   endTime    = initial[0][0] - 1;
    let   pages      = 0;
    while (pages < 19 && endTime > cutoff) {
      const url = `${BASE}/klines?symbol=${symbol}&interval=${interval}&endTime=${endTime}&limit=${limit}`;
      let raw;
      try { raw = await fetchJSON(url); } catch(e) { break; }
      if (!raw || !raw.length) break;
      allCandles.unshift(...raw.map(toCandle));
      pages++;
      if (raw.length < limit) break;
      endTime = raw[0][0] - 1;
      await new Promise(r => setTimeout(r, 60));
    }
    const seen = new Set();
    onMore(allCandles
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time));
  })();
}

return firstBatch;
```

}

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
from = raw[raw.length - 1][6] + 1;
}
return allCandles;
}

async function getTicker(symbol) {
return fetchJSON(`${BASE}/ticker/24hr?symbol=${symbol}`);
}

async function getPrice(symbol) {
return fetchJSON(`${BASE}/ticker/price?symbol=${symbol}`);
}

async function getUSDTPairs() {
const data = await fetchJSON(`${BASE}/exchangeInfo`);
return data.symbols
.filter(s => s.quoteAsset === ‘USDT’ && s.status === ‘TRADING’)
.map(s => s.symbol);
}

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
