import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candle } from './types'

const fetchCryptoCandles = vi.fn()
const fetchTwelveDataCandles = vi.fn()

vi.mock('./binance', () => ({
  fetchProducts: vi.fn(),
  fetchCandles: (...args: unknown[]) => fetchCryptoCandles(...args),
}))

vi.mock('./twelvedata', () => ({
  fetchStockProducts: vi.fn(),
  fetchTwelveDataCandles: (...args: unknown[]) => fetchTwelveDataCandles(...args),
  searchTwelveDataStocks: vi.fn(),
}))

import { fetchCandles, fetchCandlesWithMeta } from './market-data'

const candle = (t: number): Candle => ({
  time: t,
  open: 1,
  high: 1,
  low: 1,
  close: 1,
  volume: 1,
})

describe('market-data fetchCandles', () => {
  beforeEach(() => {
    fetchCryptoCandles.mockReset()
    fetchTwelveDataCandles.mockReset()
  })

  it('delegates to Binance with the requested window', async () => {
    fetchCryptoCandles.mockResolvedValue([candle(100), candle(200)])
    const start = 50
    const end = 250
    const out = await fetchCandles('crypto', 'ETHUSDT', '1w', start, end)
    expect(fetchCryptoCandles).toHaveBeenCalledWith('ETHUSDT', '1w', start, end)
    expect(out).toHaveLength(2)
  })

  it('delegates to Twelve Data with the requested window', async () => {
    fetchTwelveDataCandles.mockResolvedValue([candle(10)])
    const start = 1
    const end = 9
    await fetchCandles('stock', 'AAPL', '1d', start, end)
    expect(fetchTwelveDataCandles).toHaveBeenCalledWith('AAPL', '1d', start, end)
  })
})

describe('fetchCandlesWithMeta', () => {
  beforeEach(() => {
    fetchCryptoCandles.mockReset()
  })

  it('returns fetchedAt on every successful fetch', async () => {
    fetchCryptoCandles.mockResolvedValue([candle(1)])
    const { candles, fetchedAt } = await fetchCandlesWithMeta('crypto', 'BTCUSDT', '1d', 0, 100)
    expect(candles).toHaveLength(1)
    expect(typeof fetchedAt).toBe('number')
    expect(fetchedAt).toBeGreaterThan(0)
  })
})
