// ─── Fair Value Gap Detection & Trade Logic ────────────────────

const FVG = (() => {

  /**
   * Detect all FVGs in a candle array.
   * A bullish FVG: candle[i-2].high < candle[i].low  (gap above candle i-2)
   * A bearish FVG: candle[i-2].low  > candle[i].high (gap below candle i-2)
   *
   * Only include if gap size >= CONFIG.FVG_MIN_PCT % of mid price.
   */
  function detect(candles) {
    const fvgs = [];

    for (let i = 2; i < candles.length; i++) {
      const c0 = candles[i - 2]; // first candle
      const c1 = candles[i - 1]; // impulse candle
      const c2 = candles[i];     // third candle

      // Bullish FVG: c0.high < c2.low
      if (c0.high < c2.low) {
        const gapBot = c0.high;
        const gapTop = c2.low;
        const gapSize = gapTop - gapBot;
        const midPrice = (gapBot + gapTop) / 2;
        const gapPct = (gapSize / midPrice) * 100;

        if (gapPct >= CONFIG.FVG_MIN_PCT) {
          const mid = (gapTop + gapBot) / 2;  // Entry = Mitte der Gap
          const riskPerUnit = mid - gapBot;   // SL-Abstand = Mitte bis Unterkante
          fvgs.push({
            type:      'bull',
            gapTop,
            gapBot,
            gapMid:    mid,
            gapPct:    +gapPct.toFixed(3),
            gapSize,
            time:      c1.time,
            candleIdx: i - 1,
            // Trade levels
            entry:     mid,                              // Entry an der Gap-Mitte
            sl:        gapBot,                          // SL = Unterkante
            tp:        mid + riskPerUnit * CONFIG.RR_RATIO,
            filled:    false,
            fillTime:  null,
            closeTime: null,
            result:    'pending',
            resultPct: 0,
          });
        }
      }

      // Bearish FVG: c0.low > c2.high
      if (c0.low > c2.high) {
        const gapTop = c0.low;
        const gapBot = c2.high;
        const gapSize = gapTop - gapBot;
        const midPrice = (gapBot + gapTop) / 2;
        const gapPct = (gapSize / midPrice) * 100;

        if (gapPct >= CONFIG.FVG_MIN_PCT) {
          const mid = (gapTop + gapBot) / 2;  // Entry = Mitte der Gap
          const riskPerUnit = gapTop - mid;   // SL-Abstand = Mitte bis Oberkante
          fvgs.push({
            type:      'bear',
            gapTop,
            gapBot,
            gapMid:    mid,
            gapPct:    +gapPct.toFixed(3),
            gapSize,
            time:      c1.time,
            candleIdx: i - 1,
            // Trade levels
            entry:     mid,                              // Entry an der Gap-Mitte
            sl:        gapTop,                          // SL = Oberkante
            tp:        mid - riskPerUnit * CONFIG.RR_RATIO,
            filled:    false,
            fillTime:  null,
            result:    'pending',
            resultPct: 0,
          });
        }
      }
    }

    return fvgs;
  }

  /**
   * Evaluate each FVG against subsequent candles.
   * Sets .filled, .fillTime, .result, .resultPct, .expired
   * @param {object[]} fvgs
   * @param {object[]} candles
   * @param {string}   [tf]  - timeframe key (e.g. '1h', '4h') for expiry lookup
   */
  function evaluate(fvgs, candles, tf) {
    const maxCandles = (tf && CONFIG.FVG_EXPIRY_CANDLES[tf]) || null;

    for (const fvg of fvgs) {
      fvg.expired = false;
      // Only evaluate candles AFTER the FVG was created
      const startIdx = fvg.candleIdx + 1;

      for (let i = startIdx; i < candles.length; i++) {
        // Expiry check: gap not yet filled and time window exceeded
        if (!fvg.filled && maxCandles !== null && (i - startIdx) >= maxCandles) {
          fvg.expired = true;
          fvg.result  = 'expired';
          break;
        }
        const c = candles[i];

        if (fvg.type === 'bull') {
          // Entry: Preis erreicht die Gap-Mitte von oben (Low berührt Mid)
          if (!fvg.filled && c.low <= fvg.entry) {
            fvg.filled   = true;
            fvg.fillTime = c.time;
          }
          if (fvg.filled) {
            // TP hit
            if (c.high >= fvg.tp) {
              fvg.result    = 'win';
              fvg.closeTime = c.time;
              fvg.resultPct = +((fvg.tp - fvg.entry) / fvg.entry * 100).toFixed(2);
              break;
            }
            // SL hit
            if (c.low <= fvg.sl) {
              fvg.result    = 'loss';
              fvg.closeTime = c.time;
              fvg.resultPct = +((fvg.sl - fvg.entry) / fvg.entry * 100).toFixed(2);
              break;
            }
          }
        }

        if (fvg.type === 'bear') {
          // Entry: Preis erreicht die Gap-Mitte von unten (High berührt Mid)
          if (!fvg.filled && c.high >= fvg.entry) {
            fvg.filled   = true;
            fvg.fillTime = c.time;
          }
          if (fvg.filled) {
            // TP hit
            if (c.low <= fvg.tp) {
              fvg.result    = 'win';
              fvg.closeTime = c.time;
              fvg.resultPct = +((fvg.entry - fvg.tp) / fvg.entry * 100).toFixed(2);
              break;
            }
            // SL hit
            if (c.high >= fvg.sl) {
              fvg.result    = 'loss';
              fvg.closeTime = c.time;
              fvg.resultPct = +((fvg.entry - fvg.sl) / fvg.entry * 100).toFixed(2);
              break;
            }
          }
        }
      }
    }
    return fvgs;
  }

  /**
   * Calculate compound performance from a list of evaluated FVGs.
   * Only counts filled trades.
   */
  function calcPerformance(fvgs) {
    let equity = 100;      // start at 100%
    let wins = 0, losses = 0, pending = 0;
    const expired = fvgs.filter(f => f.expired).length;
    const equityCurve = [{ label: 'Start', value: 100 }];

    const filled = fvgs.filter(f => f.filled);

    for (const fvg of filled) {
      if (fvg.result === 'win') {
        equity *= (1 + Math.abs(fvg.resultPct) / 100);
        wins++;
      } else if (fvg.result === 'loss') {
        equity *= (1 + fvg.resultPct / 100); // resultPct negative for loss
        losses++;
      } else {
        pending++;
      }

      if (fvg.result !== 'pending') {
        equityCurve.push({
          label: new Date(fvg.fillTime * 1000).toLocaleDateString(),
          value: +equity.toFixed(2),
          result: fvg.result,
          symbol: fvg.symbol || '',
        });
      }
    }

    const totalReturn = +(equity - 100).toFixed(2);
    const winRate = filled.length > 0
      ? +((wins / (wins + losses)) * 100).toFixed(1)
      : 0;

    return { equity: +equity.toFixed(2), totalReturn, wins, losses, pending, expired, winRate, equityCurve, trades: filled };
  }

  return { detect, evaluate, calcPerformance };
})();
