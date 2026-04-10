// ─── App Config ───────────────────────────────────────────────
const CONFIG = {
  // Binance Affiliate — trage hier deinen Ref-Code ein (z.B. 'A1B2C3D4')
  BINANCE_REF_CODE: 'DEIN_CODE',

  // Binance API
  BINANCE_BASE: 'https://api.binance.com/api/v3',
  BINANCE_WS:   'wss://stream.binance.com:9443/ws',

  // FVG min gap size (0.5% of price)
  FVG_MIN_PCT: 0.5,

  // Risk/Reward ratio
  RR_RATIO: 3,

  // Timeframes available
  TIMEFRAMES: {
    '1h':  { label: '1H', interval: '1h',  limit: 300 },
    '4h':  { label: '4H', interval: '4h',  limit: 300 },
  },

  // Default watchlist (altcoins only)
  DEFAULT_WATCHLIST: [
    'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT',
    'DOGEUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT',
  ],

  // Known non-altcoin symbols (Bitcoin + stables)
  EXCLUDED_SYMBOLS: ['BTCUSDT', 'BTCBUSD', 'BTCEUR', 'BTCGBP'],
  STABLE_SUFFIXES: ['USDC', 'BUSD', 'DAI', 'TUSD', 'FDUSD', 'USDP'],

  // Scanner — top altcoins to check
  SCANNER_COINS: [
    'ETHUSDT','SOLUSDT','BNBUSDT','ADAUSDT','XRPUSDT','DOGEUSDT',
    'AVAXUSDT','DOTUSDT','MATICUSDT','LINKUSDT','LTCUSDT','UNIUSDT',
    'ATOMUSDT','NEARUSDT','APTUSDT','ARBUSDT','OPUSDT','INJUSDT',
    'SUIUSDT','SEIUSDT','TIAUSDT','WLDUSDT','STXUSDT','RUNEUSDT',
  ],

  // Colors
  COLORS: {
    bullFvg:   'rgba(63, 185, 80, 0.15)',
    bullBorder:'rgba(63, 185, 80, 0.6)',
    bearFvg:   'rgba(248, 81, 73, 0.15)',
    bearBorder:'rgba(248, 81, 73, 0.6)',
    sl:        'rgba(248, 81, 73, 0.9)',
    tp:        'rgba(63, 185, 80, 0.9)',
    oldTrade:  'rgba(88, 166, 255, 0.12)',
  }
};

// ─── Global Helpers ──────────────────────────────────────────
function _fmt(price) {
  if (!price) return '—';
  if (price >= 1000) return price.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1)    return price.toFixed(4);
  return price.toFixed(6);
}

// Detect if a symbol is an altcoin (not BTC, not a stablecoin pair)
function isAltcoin(symbol) {
  const s = symbol.toUpperCase().trim();
  if (!s.endsWith('USDT') && !s.endsWith('USDC') && !s.endsWith('BUSD')) return false;
  if (CONFIG.EXCLUDED_SYMBOLS.includes(s)) return false;
  const base = s.replace(/(USDT|USDC|BUSD)$/, '');
  if (CONFIG.STABLE_SUFFIXES.includes(base)) return false;
  return base.length >= 2;
}
