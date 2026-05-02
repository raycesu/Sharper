import { describe, expect, it } from 'vitest'
import { mapBinanceKlineRowToCandle } from './binance'
import type { BinanceKlineRow } from './binance'

describe('mapBinanceKlineRowToCandle', () => {
  it('maps base volume from index 5 and quote volume from index 7', () => {
    const row: BinanceKlineRow = [
      1_000_000,
      '10',
      '11',
      '9',
      '10.5',
      '123.45',
      1_999_000,
      '999.99',
      100,
      '50',
      '0',
      '0',
    ]
    const c = mapBinanceKlineRowToCandle(row)
    expect(c.volume).toBe(123.45)
    expect(c.quoteVolume).toBe(999.99)
    expect(c.close).toBe(10.5)
  })
})
