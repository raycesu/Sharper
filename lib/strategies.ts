import type { Candle, StrategyFn } from './types'
import { rsi, ema, macd } from './indicators'

// --- RSI Oversold / Overbought ---
// Buy when RSI crosses below oversoldLevel, sell when it crosses above overboughtLevel
export function makeRsiStrategy(oversold = 30, overbought = 70): StrategyFn {
  // Pre-calculate indicator values once the first time the strategy is called,
  // then reuse them for every subsequent candle in the same run.
  let rsiValues: (number | null)[] | null = null
  let lastCandleCount = 0

  return (candles, index, { inPosition }) => {
    if (rsiValues === null || candles.length !== lastCandleCount) {
      rsiValues = rsi(candles)
      lastCandleCount = candles.length
    }
    const current = rsiValues[index]
    const prev = index > 0 ? rsiValues[index - 1] : null
    if (current == null || prev == null) return 'hold'

    if (!inPosition && prev >= oversold && current < oversold) return 'buy'
    if (inPosition && prev <= overbought && current > overbought) return 'sell'
    return 'hold'
  }
}

// --- Golden Cross / Death Cross ---
// Buy when fast EMA crosses above slow EMA, sell when it crosses below
export function makeGoldenCrossStrategy(fastPeriod = 50, slowPeriod = 200): StrategyFn {
  let fastEma: (number | null)[] | null = null
  let slowEma: (number | null)[] | null = null
  let lastCandleCount = 0

  return (candles, index, { inPosition }) => {
    if (fastEma === null || candles.length !== lastCandleCount) {
      fastEma = ema(candles, fastPeriod)
      slowEma = ema(candles, slowPeriod)
      lastCandleCount = candles.length
    }

    const fastNow  = fastEma![index]
    const slowNow  = slowEma![index]
    const fastPrev = index > 0 ? fastEma![index - 1] : null
    const slowPrev = index > 0 ? slowEma![index - 1] : null

    if (!fastNow || !slowNow || !fastPrev || !slowPrev) return 'hold'

    const crossedAbove = fastPrev <= slowPrev && fastNow > slowNow
    const crossedBelow = fastPrev >= slowPrev && fastNow < slowNow

    if (!inPosition && crossedAbove) return 'buy'
    if (inPosition && crossedBelow) return 'sell'
    return 'hold'
  }
}

// --- MACD Signal Line Cross ---
// Buy when MACD line crosses above signal line, sell when it crosses below
export function makeMacdStrategy(): StrategyFn {
  let macdLine: (number | null)[] | null = null
  let signalLine: (number | null)[] | null = null
  let lastCandleCount = 0

  return (candles, index, { inPosition }) => {
    if (macdLine === null || candles.length !== lastCandleCount) {
      const result = macd(candles)
      macdLine = result.macdLine
      signalLine = result.signalLine
      lastCandleCount = candles.length
    }

    const mNow  = macdLine![index]
    const sNow  = signalLine![index]
    const mPrev = index > 0 ? macdLine![index - 1] : null
    const sPrev = index > 0 ? signalLine![index - 1] : null

    if (mNow == null || sNow == null || mPrev == null || sPrev == null) return 'hold'

    const crossedAbove = mPrev <= sPrev && mNow > sNow
    const crossedBelow = mPrev >= sPrev && mNow < sNow

    if (!inPosition && crossedAbove) return 'buy'
    if (inPosition && crossedBelow) return 'sell'
    return 'hold'
  }
}
