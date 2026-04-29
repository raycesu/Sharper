import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candle } from './types'

const rsiMock = vi.fn()

vi.mock('./indicators', () => ({
  rsi: (...args: unknown[]) => rsiMock(...args),
}))

import { STRATEGY_REGISTRY } from './strategies'

const makeCandles = (length: number): Candle[] =>
  Array.from({ length }, (_, index) => ({
    time: index * 604800000,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
  }))

const getStrategy = () => STRATEGY_REGISTRY.find(strategy => strategy.id === 'market-rsi-divergence')!

describe('market-rsi-divergence strategy', () => {
  beforeEach(() => {
    rsiMock.mockReset()
  })

  it('allows entries as soon as RSI values are available', () => {
    const candles = makeCandles(35)
    const assetRsi = Array.from({ length: 35 }, (_, i) => (i < 14 ? null : 30))
    const benchmarkRsi = Array.from({ length: 35 }, (_, i) => (i < 14 ? null : 45))

    rsiMock.mockImplementationOnce(() => assetRsi)
    rsiMock.mockImplementationOnce(() => benchmarkRsi)

    const strategy = getStrategy().create({
      assetCandles: candles,
      benchmarkCandles: candles,
    })

    expect(strategy(candles, 13, { inPosition: false, entryPrice: 0 })).toBe('hold')
    expect(strategy(candles, 14, { inPosition: false, entryPrice: 0 })).toBe('buy')
  })

  it('exits on peak RSI rollover after two lower weeks', () => {
    const candles = makeCandles(40)
    const assetRsi = Array.from({ length: 40 }, (_, i) => {
      if (i < 27) return 50
      if (i === 27) return 35
      if (i === 28) return 62
      if (i === 29) return 70
      if (i === 30) return 66
      if (i === 31) return 61
      return 55
    })
    const benchmarkRsi = Array.from({ length: 40 }, (_, i) => (i === 27 ? 50 : 60))

    rsiMock.mockImplementationOnce(() => assetRsi)
    rsiMock.mockImplementationOnce(() => benchmarkRsi)

    const strategy = getStrategy().create({
      assetCandles: candles,
      benchmarkCandles: candles,
    })

    expect(strategy(candles, 27, { inPosition: false, entryPrice: 0 })).toBe('buy')
    expect(strategy(candles, 28, { inPosition: true, entryPrice: 100 })).toBe('hold')
    expect(strategy(candles, 29, { inPosition: true, entryPrice: 100 })).toBe('hold')
    expect(strategy(candles, 30, { inPosition: true, entryPrice: 100 })).toBe('hold')
    expect(strategy(candles, 31, { inPosition: true, entryPrice: 100 })).toBe('sell')
  })

  it('exits when relativity index flips to -15 or below', () => {
    const candles = makeCandles(35)
    const assetRsi = Array.from({ length: 35 }, (_, i) => (i >= 28 ? 70 : 35))
    const benchmarkRsi = Array.from({ length: 35 }, (_, i) => (i === 27 ? 50 : i === 28 ? 54 : 60))

    rsiMock.mockImplementationOnce(() => assetRsi)
    rsiMock.mockImplementationOnce(() => benchmarkRsi)

    const strategy = getStrategy().create({
      assetCandles: candles,
      benchmarkCandles: candles,
    })

    expect(strategy(candles, 27, { inPosition: false, entryPrice: 0 })).toBe('buy')
    expect(strategy(candles, 28, { inPosition: true, entryPrice: 100 })).toBe('sell')
  })

  it('resets rollover state after a trade closes', () => {
    const candles = makeCandles(45)
    const assetRsi = Array.from({ length: 45 }, (_, i) => {
      if (i < 27) return 50
      if (i === 27) return 35
      if (i === 28) return 68
      if (i === 29) return 63
      if (i === 30) return 61
      if (i === 35) return 34
      return 55
    })
    const benchmarkRsi = Array.from({ length: 45 }, (_, i) => (i === 27 || i === 35 ? 50 : 60))

    rsiMock.mockImplementationOnce(() => assetRsi)
    rsiMock.mockImplementationOnce(() => benchmarkRsi)

    const strategy = getStrategy().create({
      assetCandles: candles,
      benchmarkCandles: candles,
    })

    expect(strategy(candles, 27, { inPosition: false, entryPrice: 0 })).toBe('buy')
    expect(strategy(candles, 28, { inPosition: true, entryPrice: 100 })).toBe('hold')
    expect(strategy(candles, 29, { inPosition: true, entryPrice: 100 })).toBe('hold')
    expect(strategy(candles, 30, { inPosition: true, entryPrice: 100 })).toBe('sell')
    expect(strategy(candles, 35, { inPosition: false, entryPrice: 0 })).toBe('buy')
  })
})
