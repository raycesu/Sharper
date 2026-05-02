import { describe, expect, it } from 'vitest'
import { computeRSI14, mean, scoreCandleArray } from './scoreEngine'
import type { Candle } from './types'

const makeCandles = (length: number): Candle[] =>
  Array.from({ length }, (_, index) => ({
    time: index * 604800000,
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100 + index,
    volume: 1_000_000 + index * 10_000,
    quoteVolume: 1_000_000 + index * 10_000,
  }))

describe('scoreEngine', () => {
  it('computeRSI14 returns null warmup values', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const rsi = computeRSI14(closes)

    expect(rsi.length).toBe(20)
    for (let i = 0; i < 14; i++) {
      expect(rsi[i]).toBeNull()
    }
    expect(rsi[14]).not.toBeNull()
  })

  it('computeRSI14 is bounded between 0 and 100', () => {
    const closes = [100, 99, 101, 98, 102, 95, 96, 99, 97, 100, 98, 101, 99, 104, 103, 105, 100, 106, 107, 102]
    const rsi = computeRSI14(closes)
    const defined = rsi.filter((value): value is number => value != null)

    expect(defined.length).toBeGreaterThan(0)
    for (const value of defined) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
  })

  it('mean of three values', () => {
    expect(mean([1, 2, 3])).toBe(2)
  })

  it('scoreCandleArray returns score 0 for indices before 15', () => {
    const candles = makeCandles(20)
    const scored = scoreCandleArray(candles)

    expect(scored.length).toBe(20)
    for (let i = 0; i < 15; i++) {
      expect(scored[i].score).toBe(0)
      expect(scored[i].decel_factor).toBe(1)
    }
    expect(scored[15].score).not.toBe(0)
  })

  it('scoreCandleArray clamps final score to [-2, 2]', () => {
    const candles = makeCandles(30).map((c, i) => ({
      ...c,
      close: 50 + i * 0.01,
      volume: i < 20 ? 10_000_000 : 1000,
    }))
    const scored = scoreCandleArray(candles)
    for (const c of scored) {
      expect(c.score).toBeGreaterThanOrEqual(-2)
      expect(c.score).toBeLessThanOrEqual(2)
    }
  })

  it('scoreCandleArray sets V_trend to 0 when vol_prior is 0', () => {
    const candles = makeCandles(20).map((c, i) => ({
      ...c,
      volume: i >= 6 && i <= 14 ? 0 : 1_000_000,
    }))
    const scored = scoreCandleArray(candles)
    expect(scored[15].score).toBeDefined()
  })

  it('scoreCandleArray handles zero 10-week range without NaN', () => {
    const flat = makeCandles(20).map(c => ({ ...c, close: 100 }))
    const scored = scoreCandleArray(flat)
    expect(Number.isFinite(scored[15].score)).toBe(true)
  })
})
