import type { Candle } from './types'

export function sma(candles: Candle[], period: number): (number | null)[] {
  return candles.map((_, i) => {
    if (i < period - 1) return null
    const slice = candles.slice(i - period + 1, i + 1)
    return slice.reduce((sum, c) => sum + c.close, 0) / period
  })
}

export function ema(candles: Candle[], period: number): (number | null)[] {
  const k = 2 / (period + 1)
  const result: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < period) return result
  const seed = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  result[period - 1] = seed
  for (let i = period; i < candles.length; i++) {
    result[i] = candles[i].close * k + (result[i - 1] as number) * (1 - k)
  }
  return result
}

export function rsi(candles: Candle[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null)
  if (candles.length < period + 1) return result

  let gains = 0
  let losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close
    if (diff > 0) gains += diff
    else losses += Math.abs(diff)
  }
  let avgGain = gains / period
  let avgLoss = losses / period

  const calcRsi = (ag: number, al: number) =>
    al === 0 ? 100 : 100 - 100 / (1 + ag / al)

  result[period] = calcRsi(avgGain, avgLoss)

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? Math.abs(diff) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    result[i] = calcRsi(avgGain, avgLoss)
  }
  return result
}

export function macd(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
) {
  const fastEma = ema(candles, fastPeriod)
  const slowEma = ema(candles, slowPeriod)

  const macdLine = candles.map((_, i) => {
    if (fastEma[i] == null || slowEma[i] == null) return null
    return (fastEma[i] as number) - (slowEma[i] as number)
  })

  // EMA of the MACD line as the signal line
  const macdAsCandles: Candle[] = candles.map((c, i) => ({
    ...c,
    close: macdLine[i] ?? 0,
  }))
  const signalLine = ema(macdAsCandles, signalPeriod)

  const histogram = macdLine.map((m, i) => {
    if (m == null || signalLine[i] == null) return null
    return m - (signalLine[i] as number)
  })

  return { macdLine, signalLine, histogram }
}

export function bollingerBands(candles: Candle[], period = 20, stdDevMult = 2) {
  const middle = sma(candles, period)
  return candles.map((_, i) => {
    if (middle[i] == null) return null
    const slice = candles.slice(i - period + 1, i + 1).map(c => c.close)
    const mean = middle[i] as number
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    return {
      upper:  mean + stdDevMult * sd,
      middle: mean,
      lower:  mean - stdDevMult * sd,
    }
  })
}
