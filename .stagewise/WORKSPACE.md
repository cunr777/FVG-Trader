# FVG Trader — Workspace Briefing

## SNAPSHOT

type: single  
langs: HTML, CSS, JavaScript  
runtimes: browser (client-side)  
pkgManager: none (CDN + static)  
deliverables: static HTML app → Vercel  
rootConfigs: css/style.css | js/config.js

---

## ARCHITECTURE

### index.html (Chart View)

entry: w1ee0/index.html → loads js/(config|binance|fvg|chart-manager|watchlist|main).js  
routing: navbar links to index.html | trades.html | performance.html  
state: Watchlist (localStorage) | currentTf (sessionStorage redirect) | currentSymbol (watchlist selection)  
api: Binance REST (klines, ticker, exchangeInfo) | Binance WS (miniTicker live prices)  
ui: grid(navbar 44px | sidebar 220px | chart-area 1fr) → canvas overlay for FVG visualization  
build: no build step, served as-is  
dirs: `js/` → modules, `css/` → styles

### trades.html (Live Scanner)

entry: w1ee0/trades.html → inline script  
routing: sessionStorage pass-through to index.html (goto_symbol, goto_tf)  
state: allResults[] (FVG setups from scan) | currentTf | currentFilter (all|bull|bear)  
api: Binance REST (getKlines, getPrice) — polls entire watchlist every 60s  
ui: cards-grid layout (300px min cols) with live price marker, TP/SL zones, triggered banner  
build: none

### performance.html (Backtest)

entry: w1ee0/performance.html → js/performance.js  
state: symbol, timeframe, startDate, endDate → computed equity curve  
api: Binance REST (getKlinesRange for date range)  
ui: KPI cards (return, win-rate, trades, wins, losses, pending) | equity curve (Chart.js) | trade table  
build: none

---

## KEY MODULES

`w1ee0/js/config.js` → CONFIG object (API endpoints, FVG thresholds, watchlist defaults, colors) | `_fmt()` price formatter | `isAltcoin()` filter  
`w1ee0/js/binance.js` → Binance REST (getKlines, getKlinesRange, getTicker, getPrice, getUSDTPairs) | WS (subscribeTicker) | OHLCV → normalized candles  
`w1ee0/js/fvg.js` → FVG.detect(candles) → finds bull/bear gaps ≥0.5% | FVG.evaluate(fvgs, candles) → sets filled|result|resultPct | FVG.calcPerformance(fvgs) → compound equity + equity curve  
`w1ee0/js/chart-manager.js` → LightweightCharts wrapper | canvas overlay (2D) for trade boxes | _drawFvgZone (blue unfilled) | _drawTradeBox (green TP / red SL / dashed entry) | hit-test hover labels  
`w1ee0/js/watchlist.js` → persistent list (localStorage) | add/remove/select | live ticker poll (10s interval) | search validation (Binance check)  
`w1ee0/js/main.js` → index.html init | ChartManager.init | Watchlist.init | TF button events | live ticker WS management  
`w1ee0/js/performance.js` → date range input → Binance.getKlinesRange → FVG.detect+evaluate → Chart.js equity curve render  

---

## DATA FLOW

1. **Chart (index.html)**  
   Symbol click in watchlist → _loadSymbol(sym) → ChartManager.loadChart(sym, tf) → Binance.getKlines → FVG.detect → FVG.evaluate → canvas redraw  
   Live: Binance.subscribeTicker → navbar update

2. **Scanner (trades.html)**  
   Click refresh → getWatchlist() → for each symbol: Binance.getKlines + getPrice → FVG.detect → check if currentPrice in gap → allResults[] → renderCards (filter bull|bear)

3. **Backtest (performance.html)**  
   Form submit (symbol, TF, dateRange) → Binance.getKlinesRange → FVG.detect+evaluate → FVG.calcPerformance → KPI update + Chart.js equity curve + trade table

---

## STATE MANAGEMENT

localStorage:  
- `fvg_watchlist` → JSON array of symbols (e.g., ["ETHUSDT", "SOLUSDT"])  

sessionStorage:  
- `goto_symbol` → pass symbol from trades.html to index.html  
- `goto_tf` → pass timeframe

global JS (runtime):  
- ChartManager: currentSymbol, currentTf, allCandles, allFvgs, hoveredFvg  
- Watchlist: items, activeSymbol, priceWs  
- trades.html: allResults[], currentTf, currentFilter

---

## UI PATTERNS

**Navbar** (44px height, dark theme)  
- Logo + nav links (📈 Chart | 💡 Trade Ideas | 📊 Performance)  
- Live ticker right: symbol label | price | change %

**Watchlist Sidebar** (220px width, left)  
- Search input (Enter to add)  
- Items list: icon | symbol | price | 24h change % | remove btn  
- Price updates every 10s or via WS

**Chart Area** (main)  
- Lightweight-charts candlestick  
- Canvas overlay: FVG zones (blue, unfilled) + trade boxes (green TP zone / red SL zone / dashed entry)  
- Hover: TV-style labels (price + %) on right side  
- Stats bar: FVGs count | wins | losses | win-rate | return %

**Trade Cards** (trades.html, 300px grid)  
- Left border: green (bull) | red (bear)  
- Mini visual: TP zone | SL zone | entry line | current price marker (gold)  
- Badge: type (▲ Long | ▼ Short) + TF  
- Levels: TP | Entry | SL (prices)  
- Footer: Gap % | current price | 1:3 RR  
- Click → sessionStorage pass-through to index.html

**KPI Cards** (performance.html)  
- 6-column grid: Total Return | Win-Rate | Trades | Wins | Losses | Pending

---

## STYLING

file: `w1ee0/css/style.css` (16KB, 602 lines)  
theme: dark (GitHub-inspired: #0d1117 bg)  
colors: --accent (#26a69a green), --red (#ef5350), --yellow (#f0b90b)  
spacing: --radius (4px), --radius-lg (8px)  
font: Inter (Google Fonts)  
scrollbars: custom (5px width, --border color)

---

## API INTEGRATION

**Binance REST** (https://api.binance.com/api/v3)  
- `/klines` → OHLCV data (1h, 4h intervals)  
- `/klines?startTime=X&endTime=Y` → range queries (backtest)  
- `/ticker/24hr` → 24h stats  
- `/ticker/price` → current price  
- `/exchangeInfo` → trading pairs filter  
- Rate limit: public (1200 req/min)

**Binance WebSocket** (wss://stream.binance.com:9443/ws)  
- `/{symbol}@miniTicker` → live price + 24h change %  
- Connection opened in main.js (navbar ticker)  
- Closed & reopened on symbol change

---

## LOOKUPS

add altcoin to watchlist → w1ee0/js/watchlist.js::add() | validate via isAltcoin(config.js) + Binance.getPrice()  
detect FVGs in candles → w1ee0/js/fvg.js::FVG.detect(candles)  
evaluate trade fills → w1ee0/js/fvg.js::FVG.evaluate(fvgs, candles)  
render chart with FVG overlays → w1ee0/js/chart-manager.js::loadChart() + _redraw()  
scan watchlist for active trades → w1ee0/trades.html inline + getWatchlist() loop  
backtest strategy → w1ee0/js/performance.js::runCalc() + Binance.getKlinesRange()  
update watchlist prices → w1ee0/js/watchlist.js::_fetchPrices() or WS callback  
navigate symbol with TF → sessionStorage (goto_symbol, goto_tf) → w1ee0/js/main.js line 28–44

---

## BUILD & DEPLOY

no build step: served as static files  
entry points: index.html | trades.html | performance.html  
external libs (CDN):  
  - lightweight-charts@4.2.0 (candlestick charting)  
  - chart.js@4.4.0 (equity curve)  
  - fonts.googleapis.com (Inter)  
deployment: Vercel (fvg-trader.vercel.app)  
git: remote origin (fetch: https://...)

---

## CONVENTIONS

naming:  
  - camelCase for functions & vars  
  - UPPERCASE for CONFIG objects  
  - underscore prefix for private (e.g., _loadSymbol, _fmt)  

modules: IIFE pattern (e.g., const ChartManager = (() => { ... return { ... }; })())  
error handling: try/catch, console.warn on Binance failures  
timestamps: unix seconds (k[0]/1000)  
prices: formatted via _fmt() — 2 decimals for >1000, 4 for >1, 6 for <1  
colors: --accent (primary green), --red (loss), --green (win), --yellow (warning)

---

## FILES TREE

```
w1ee0/
├── .git/                    git repo
├── index.html               chart + watchlist view
├── trades.html              live FVG scanner
├── performance.html         backtest UI
├── css/
│   └── style.css            dark theme, grid layout, navbar, cards
└── js/
    ├── config.js            CONFIG, helpers (_fmt, isAltcoin)
    ├── binance.js           REST + WS API wrapper
    ├── fvg.js               detection, evaluation, performance calc
    ├── chart-manager.js     LightweightCharts + canvas overlay
    ├── watchlist.js         persistent list, search, pricing
    ├── main.js              index.html init & event handlers
    └── performance.js       backtest runner
```

---

## NEXT STEPS (Common Tasks)

- add new TF: CONFIG.TIMEFRAMES + ctrl-tf-btn buttons (trades.html, index.html)
- change FVG threshold: CONFIG.FVG_MIN_PCT (0.5 = 0.5%)
- customize colors: css/style.css :root variables
- exclude symbols: CONFIG.EXCLUDED_SYMBOLS | CONFIG.STABLE_SUFFIXES
- extend watchlist: CONFIG.DEFAULT_WATCHLIST
- modify trade logic: FVG.detect() | FVG.evaluate() detection rules
- add chart indicators: ChartManager.loadChart() before _redraw()
- fix styling: css/style.css or inline <style> blocks
