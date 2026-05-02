import { calcStats } from './backtest-stats'
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
export { calcStats } from './backtest-stats'

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
    const candlesSoFar = candles.slice(0, i + 1)
    const signal = strategy(candlesSoFar, i, { inPosition, entryPrice })

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
