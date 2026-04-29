import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Candle } from '@/lib/types'

const fetchCandlesMock = vi.fn()
const runBacktestMock = vi.fn()
const rsiMock = vi.fn()
const createStrategyMock = vi.fn(() => 'hold')

vi.mock('@/lib/market-data', () => ({
  CRYPTO_INTERVALS: ['1h', '4h', '1d', '1w'],
  STOCK_INTERVALS: ['5m', '15m', '1h', '1d', '1w'],
  fetchCandles: (...args: unknown[]) => fetchCandlesMock(...args),
}))

vi.mock('@/lib/engine', () => ({
  runBacktest: (...args: unknown[]) => runBacktestMock(...args),
}))

vi.mock('@/lib/indicators', () => ({
  rsi: (...args: unknown[]) => rsiMock(...args),
}))

vi.mock('@/lib/strategies', () => ({
  STRATEGY_REGISTRY: [
    {
      id: 'market-rsi-divergence',
      label: 'Market RSI Divergence',
      create: (...args: unknown[]) => createStrategyMock(...args),
    },
  ],
}))

import { POST } from './route'

const makeCandles = (length: number): Candle[] =>
  Array.from({ length }, (_, index) => ({
    time: index * 604800000,
    open: 100,
    high: 110,
    low: 90,
    close: 100 + index,
    volume: 1000,
  }))

describe('backtest route weekly enforcement', () => {
  beforeEach(() => {
    fetchCandlesMock.mockReset()
    runBacktestMock.mockReset()
    rsiMock.mockReset()
    createStrategyMock.mockClear()

    const candles = makeCandles(40)
    fetchCandlesMock.mockResolvedValue(candles)
    runBacktestMock.mockReturnValue({
      trades: [],
      equityCurve: candles.map(c => ({ time: c.time, value: 10000 })),
      stats: {
        totalReturn: 0,
        totalReturnAbs: 0,
        winRate: 0,
        totalTrades: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        bestTrade: 0,
        worstTrade: 0,
      },
    })
    rsiMock.mockReturnValue(Array.from({ length: 40 }, () => 50))
  })

  it('forces interval to weekly for market-rsi-divergence requests', async () => {
    const req = new NextRequest('http://localhost/api/backtest', {
      method: 'POST',
      body: JSON.stringify({
        assetClass: 'crypto',
        productId: 'ETHUSDT',
        interval: '1d',
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        strategyId: 'market-rsi-divergence',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(fetchCandlesMock).toHaveBeenNthCalledWith(
      1,
      'crypto',
      'ETHUSDT',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
    expect(fetchCandlesMock).toHaveBeenNthCalledWith(
      2,
      'crypto',
      'BTCUSDT',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('uses SPY benchmark for BTC assets', async () => {
    const req = new NextRequest('http://localhost/api/backtest', {
      method: 'POST',
      body: JSON.stringify({
        assetClass: 'crypto',
        productId: 'BTCUSDT',
        interval: '1d',
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        strategyId: 'market-rsi-divergence',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(fetchCandlesMock).toHaveBeenNthCalledWith(
      2,
      'stock',
      'SPY',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('uses SPY benchmark for stock assets', async () => {
    const req = new NextRequest('http://localhost/api/backtest', {
      method: 'POST',
      body: JSON.stringify({
        assetClass: 'stock',
        productId: 'AAPL',
        interval: '1d',
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        strategyId: 'market-rsi-divergence',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(fetchCandlesMock).toHaveBeenNthCalledWith(
      2,
      'stock',
      'SPY',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
  })
})
