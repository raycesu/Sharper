import { describe, expect, it, vi } from 'vitest'
import type { Candle } from './types'
import { runBacktest } from './engine'

const makeCandles = (n: number, close = 100): Candle[] =>
  Array.from({ length: n }, (_, i) => ({
    time: i * 86_400_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  }))

describe('runBacktest', () => {
  it('passes only history through current bar to the strategy', () => {
    const lengths: number[] = []
    const candles = makeCandles(5, 10)
    const strategy = vi.fn((slice: Candle[], index: number) => {
      lengths.push(slice.length)
      expect(slice.length).toBe(index + 1)
      return 'hold' as const
    })

    runBacktest(candles, strategy, { initialCapital: 1000, positionSizePct: 1, fee: 0 })
    expect(lengths).toEqual([1, 2, 3, 4, 5])
  })

  it('force-closes an open position at the last close', () => {
    const candles = makeCandles(3, 100)
    const strategy = vi.fn((_, index: number) => {
      if (index === 1) return 'buy' as const
      return 'hold' as const
    })

    const { trades, equityCurve } = runBacktest(candles, strategy, {
      initialCapital: 1000,
      positionSizePct: 1,
      fee: 0,
    })

    const sells = trades.filter(t => t.type === 'sell')
    expect(sells.length).toBeGreaterThanOrEqual(1)
    expect(equityCurve[equityCurve.length - 1].value).toBeCloseTo(sells[sells.length - 1].value, 4)
  })
})
