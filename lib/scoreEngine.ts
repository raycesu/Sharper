import type { Candle } from './types'

export type ScoredCandle = Candle & {
  score: number
  decel_factor: number
  low_10w?: number
  RSI_now?: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((acc, value) => acc + value, 0) / values.length
}

export function computeRSI14(closes: number[]): Array<number | null> {
  const rsi: Array<number | null> = new Array(closes.length).fill(null)
  if (closes.length < 15) return rsi

  let gains = 0
  let losses = 0
  for (let i = 1; i <= 14; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gains += diff
    else losses += Math.abs(diff)
  }

  let avgGain = gains / 14
  let avgLoss = losses / 14
  rsi[14] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))

  for (let i = 15; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    const gain = diff >= 0 ? diff : 0
    const loss = diff < 0 ? Math.abs(diff) : 0
    avgGain = (avgGain * 13 + gain) / 14
    avgLoss = (avgLoss * 13 + loss) / 14
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss))
  }

  return rsi
}

const getRSIGate = (rsi: number | null): number => {
  if (rsi == null) return 0.6
  if (rsi < 35) return 1.5
  if (rsi < 45) return 1.2
  if (rsi < 55) return 0.6
  if (rsi < 65) return 0.8
  return 0.5
}

/** Min/max of closes[t-9..t] inclusive (10 bars); O(10) per call, no allocations. */
const minMaxCloseWindow10 = (closes: number[], t: number): { min: number; max: number } => {
  const start = t - 9
  let minv = closes[start]
  let maxv = closes[start]
  for (let k = start + 1; k <= t; k++) {
    const v = closes[k]
    if (v < minv) minv = v
    if (v > maxv) maxv = v
  }
  return { min: minv, max: maxv }
}

export function scoreCandleArray(candles: Candle[]): ScoredCandle[] {
  const closes = candles.map(candle => candle.close)
  const rsiValues = computeRSI14(closes)

  return candles.map((candle, t) => {
    const rsiNow = rsiValues[t]
    const low10w = t >= 9 ? minMaxCloseWindow10(closes, t).min : undefined

    if (t < 15) {
      const base: ScoredCandle = {
        ...candle,
        score: 0,
        decel_factor: 1,
      }
      if (low10w !== undefined) base.low_10w = low10w
      if (rsiNow != null) base.RSI_now = rsiNow
      return base
    }

    const volRecent = mean([candles[t].volume, candles[t - 1].volume, candles[t - 2].volume])
    const volPrior = mean([candles[t - 3].volume, candles[t - 4].volume, candles[t - 5].volume])
    const V_trend = volPrior === 0 ? 0 : clamp(((volRecent - volPrior) / volPrior) * -3, -1, 1)

    const { min: low_10w, max: high_10w } = minMaxCloseWindow10(closes, t)
    const range = high_10w - low_10w
    const P_context =
      range === 0 ? 0 : clamp(1 - ((candle.close - low_10w) / range) * 2, -1, 1)

    const gate = getRSIGate(rsiNow)

    let decel_factor = 1
    const c2 = closes[t - 2]
    const c4 = closes[t - 4]
    if (c2 === 0 || c4 === 0) {
      decel_factor = 1
    } else {
      const momentum_recent = (closes[t] - c2) / c2
      const momentum_prior = (c2 - c4) / c4
      decel_factor = clamp(1 + (momentum_prior - momentum_recent), 0.5, 1.5)
    }

    const raw = V_trend * 0.6 + P_context * 0.4
    const score = clamp(raw * gate * decel_factor * 2, -2, 2)

    const out: ScoredCandle = {
      ...candle,
      score,
      decel_factor,
      low_10w,
    }
    if (rsiNow != null) out.RSI_now = rsiNow
    return out
  })
}
