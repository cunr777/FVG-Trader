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
          fvgs.push({
            type:      'bull',
            gapTop,
            gapBot,
            gapPct:    +gapPct.toFixed(3),
            gapSize,
            time:      c1.time,     // FVG created at impulse candle
            candleIdx: i - 1,
            // Trade levels
            entry:     gapTop,      // Entry at top of FVG
            sl:        gapBot,      // SL at bottom of FVG
            tp:        gapTop + (gapSize * CONFIG.RR_RATIO),
            filled:    false,
            fillTime:  null,
            result:    'pending',   // 'win' | 'loss' | 'pending'
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
          fvgs.push({
            type:      'bear',
            gapTop,
            gapBot,
            gapPct:    +gapPct.toFixed(3),
            gapSize,
            time:      c1.time,
            candleIdx: i - 1,
            // Trade levels
            entry:     gapBot,      // Entry at bottom of FVG
            sl:        gapTop,      // SL at top of FVG
            tp:        gapBot - (gapSize * CONFIG.RR_RATIO),
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
   * Sets .filled, .fillTime, .result, .resultPct
   */
  function evaluate(fvgs, candles) {
    for (const fvg of fvgs) {
      // Only evaluate candles AFTER the FVG was created
      const startIdx = fvg.candleIdx + 1;

      for (let i = startIdx; i < candles.length; i++) {
        const c = candles[i];

        if (fvg.type === 'bull') {
          // Entry: price dips into gapTop area (low touches entry zone)
          if (!fvg.filled && c.low <= fvg.entry && c.high >= fvg.gapBot) {
            fvg.filled   = true;
            fvg.fillTime = c.time;
          }
          if (fvg.filled) {
            // TP hit
            if (c.high >= fvg.tp) {
              fvg.result    = 'win';
              fvg.resultPct = +((fvg.tp - fvg.entry) / fvg.entry * 100).toFixed(2);
              break;
            }
            // SL hit
            if (c.low <= fvg.sl) {
              fvg.result    = 'loss';
              fvg.resultPct = +((fvg.sl - fvg.entry) / fvg.entry * 100).toFixed(2);
              break;
            }
          }
        }

        if (fvg.type === 'bear') {
          // Entry: price bounces into gapBot area
          if (!fvg.filled && c.high >= fvg.entry && c.low <= fvg.gapTop) {
            fvg.filled   = true;
            fvg.fillTime = c.time;
          }
          if (fvg.filled) {
            // TP hit
            if (c.low <= fvg.tp) {
              fvg.result    = 'win';
              fvg.resultPct = +((fvg.entry - fvg.tp) / fvg.entry * 100).toFixed(2);
              break;
            }
            // SL hit
            if (c.high >= fvg.sl) {
              fvg.result    = 'loss';
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

    return { equity: +equity.toFixed(2), totalReturn, wins, losses, pending, winRate, equityCurve, trades: filled };
  }

  return { detect, evaluate, calcPerformance };
})();
