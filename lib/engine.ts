import type {
  Candle,
  Trade,
  BacktestStats,
  BacktestResult,
  StrategyFn,
  StrategySignal,
  TimeValue,
} from './types'

// Re-export for backward compatibility
export type { Trade, BacktestStats, BacktestResult, StrategyFn, StrategySignal }

export function runBacktest(
  candles: Candle[],
  strategy: StrategyFn,
  config: {
    initialCapital: number
    positionSizePct: number   // 1.0 = use 100% of available cash per trade
    fee: number               // 0.001 = 0.1% per trade
  },
): BacktestResult {
  const { initialCapital, positionSizePct, fee } = config
  let cash = initialCapital
  let holdings = 0
  let entryPrice = 0
  let entryValue = 0
  let inPosition = false

  const trades: Trade[] = []
  const equityCurve: TimeValue[] = []

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i]
    const signal = strategy(candles, i, { inPosition, entryPrice })

    if (signal === 'buy' && !inPosition) {
      const spend = cash * positionSizePct
      const feeAmount = spend * fee
      const quantity = (spend - feeAmount) / candle.close
      entryValue = spend
      holdings = quantity
      cash -= spend
      entryPrice = candle.close
      inPosition = true
      trades.push({
        type: 'buy',
        price: candle.close,
        quantity,
        time: candle.time,
        value: spend,
      })
    } else if (signal === 'sell' && inPosition) {
      const grossValue = holdings * candle.close
      const feeAmount = grossValue * fee
      const proceeds = grossValue - feeAmount
      const pnl = proceeds - entryValue
      const pnlPct = (pnl / entryValue) * 100
      trades.push({
        type: 'sell',
        price: candle.close,
        quantity: holdings,
        time: candle.time,
        value: proceeds,
        pnl,
        pnlPct,
      })
      cash += proceeds
      holdings = 0
      inPosition = false
      entryPrice = 0
      entryValue = 0
    }

    equityCurve.push({ time: candle.time, value: cash + holdings * candle.close })
  }

  // Force-close open position at last candle price
  if (inPosition && candles.length > 0) {
    const lastCandle = candles[candles.length - 1]
    const grossValue = holdings * lastCandle.close
    const proceeds = grossValue * (1 - fee)
    const pnl = proceeds - entryValue
    const pnlPct = (pnl / entryValue) * 100
    trades.push({
      type: 'sell',
      price: lastCandle.close,
      quantity: holdings,
      time: lastCandle.time,
      value: proceeds,
      pnl,
      pnlPct,
    })
    cash += proceeds
    if (equityCurve.length > 0) {
      equityCurve[equityCurve.length - 1].value = cash
    }
  }

  const stats = calcStats(trades, equityCurve, initialCapital)
  return { trades, equityCurve, stats }
}

function calcStats(
  trades: Trade[],
  equityCurve: TimeValue[],
  initialCapital: number,
): BacktestStats {
  const sellTrades = trades.filter(t => t.type === 'sell')
  const winningTrades = sellTrades.filter(t => (t.pnl ?? 0) > 0)
  const finalValue = equityCurve[equityCurve.length - 1]?.value ?? initialCapital

  // Max drawdown
  let peak = initialCapital
  let maxDrawdown = 0
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value
    const drawdown = peak > 0 ? (peak - point.value) / peak : 0
    if (drawdown > maxDrawdown) maxDrawdown = drawdown
  }

  // Derive annualization factor from actual candle spacing
  let periodsPerYear = 365
  if (equityCurve.length > 1) {
    const totalMs = equityCurve[equityCurve.length - 1].time - equityCurve[0].time
    const avgStepMs = totalMs / (equityCurve.length - 1)
    // Use calendar-year ms for crypto (24/7); this approximates well for stocks too
    periodsPerYear = (365.25 * 24 * 3600 * 1000) / avgStepMs
  }
  const annFactor = Math.sqrt(periodsPerYear)

  const returns = equityCurve.slice(1).map((p, i) => {
    const prev = equityCurve[i].value
    return prev > 0 ? (p.value - prev) / prev : 0
  })

  const n = returns.length || 1
  const avgReturn = returns.reduce((s, r) => s + r, 0) / n
  const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annFactor : 0

  // Sortino: downside deviation uses the same denominator (n) as variance for consistency
  const downsideVariance = returns.reduce((s, r) => s + (r < 0 ? r ** 2 : 0), 0) / n
  const downsideDev = Math.sqrt(downsideVariance)
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annFactor : 0

  const pnlPcts = sellTrades.map(t => t.pnlPct ?? 0)

  return {
    totalReturn: ((finalValue - initialCapital) / initialCapital) * 100,
    totalReturnAbs: finalValue - initialCapital,
    winRate: sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0,
    totalTrades: sellTrades.length,
    maxDrawdown: maxDrawdown * 100,
    sharpeRatio,
    sortinoRatio,
    bestTrade:  pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0,
    worstTrade: pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0,
  }
}
