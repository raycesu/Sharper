import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Candle } from '@/lib/types'

const fetchCandlesMock = vi.fn()
const fetchCandlesWithMetaMock = vi.fn()
const runBacktestMock = vi.fn()
const rsiMock = vi.fn()

vi.mock('@/lib/market-data', () => ({
  CRYPTO_INTERVALS: ['1h', '4h', '1d', '1w'],
  STOCK_INTERVALS: ['5m', '15m', '1h', '1d', '1w'],
  fetchCandles: (...args: unknown[]) => fetchCandlesMock(...args),
  fetchCandlesWithMeta: (...args: unknown[]) => fetchCandlesWithMetaMock(...args),
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
      label: 'Operation Seven-Point Five',
      create: () => () => 'hold' as const,
    },
    {
      id: 'volume-momentum-weekly',
      label: 'The Volume Masterpiece',
      create: () => () => 'hold' as const,
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

describe('backtest route strategy interval behavior', () => {
  beforeEach(() => {
    fetchCandlesMock.mockReset()
    fetchCandlesWithMetaMock.mockReset()
    runBacktestMock.mockReset()
    rsiMock.mockReset()

    const candles = makeCandles(40)
    fetchCandlesMock.mockResolvedValue(candles)
    fetchCandlesWithMetaMock.mockResolvedValue({ candles, fetchedAt: Date.now() })
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

  it('forces interval to weekly for volume-momentum-weekly requests', async () => {
    const candles = makeCandles(70)
    fetchCandlesWithMetaMock.mockResolvedValue({ candles, fetchedAt: Date.now() })
    fetchCandlesMock.mockResolvedValue(candles)

    const req = new NextRequest('http://localhost/api/backtest', {
      method: 'POST',
      body: JSON.stringify({
        assetClass: 'crypto',
        productId: 'ETHUSDT',
        interval: '1d',
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        strategyId: 'volume-momentum-weekly',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(fetchCandlesWithMetaMock).toHaveBeenNthCalledWith(
      1,
      'crypto',
      'ETHUSDT',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
    expect(fetchCandlesMock).toHaveBeenNthCalledWith(
      1,
      'crypto',
      'BTCUSDT',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
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
    expect(fetchCandlesWithMetaMock).toHaveBeenNthCalledWith(
      1,
      'crypto',
      'ETHUSDT',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('uses SPY benchmark for BTC assets', async () => {
    const candles = makeCandles(70)
    fetchCandlesWithMetaMock.mockResolvedValue({ candles, fetchedAt: Date.now() })
    fetchCandlesMock.mockResolvedValue(candles)

    const req = new NextRequest('http://localhost/api/backtest', {
      method: 'POST',
      body: JSON.stringify({
        assetClass: 'crypto',
        productId: 'BTCUSDT',
        interval: '1d',
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        strategyId: 'volume-momentum-weekly',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(fetchCandlesMock).toHaveBeenNthCalledWith(
      1,
      'stock',
      'SPY',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('uses SPY benchmark for stock assets', async () => {
    const candles = makeCandles(70)
    fetchCandlesWithMetaMock.mockResolvedValue({ candles, fetchedAt: Date.now() })
    fetchCandlesMock.mockResolvedValue(candles)

    const req = new NextRequest('http://localhost/api/backtest', {
      method: 'POST',
      body: JSON.stringify({
        assetClass: 'stock',
        productId: 'AAPL',
        interval: '1d',
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        strategyId: 'volume-momentum-weekly',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(fetchCandlesMock).toHaveBeenNthCalledWith(
      1,
      'stock',
      'SPY',
      '1w',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('adds asset RSI at entry to market-rsi-divergence trades', async () => {
    const candles = makeCandles(40)
    fetchCandlesWithMetaMock.mockResolvedValue({ candles, fetchedAt: Date.now() })
    fetchCandlesMock.mockResolvedValue(candles)
    rsiMock.mockReturnValue(candles.map((_, index) => (index === 14 ? 37.25 : 50)))
    runBacktestMock.mockReturnValue({
      trades: [
        {
          type: 'buy',
          price: candles[14].close,
          quantity: 1,
          time: candles[14].time,
          value: 1000,
        },
        {
          type: 'sell',
          price: candles[20].close,
          quantity: 1,
          time: candles[20].time,
          value: 1200,
          pnl: 200,
          pnlPct: 20,
        },
      ],
      equityCurve: candles.map(c => ({ time: c.time, value: 10000 })),
      stats: {
        totalReturn: 2,
        totalReturnAbs: 200,
        winRate: 100,
        totalTrades: 1,
        maxDrawdown: 0,
        sharpeRatio: 1,
        sortinoRatio: 1,
        bestTrade: 20,
        worstTrade: 20,
      },
    })

    const req = new NextRequest('http://localhost/api/backtest', {
      method: 'POST',
      body: JSON.stringify({
        assetClass: 'crypto',
        productId: 'ETHUSDT',
        interval: '1w',
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        strategyId: 'market-rsi-divergence',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.runs[0].trades[0].entryScore).toBe(37.25)
    expect(json.runs[0].trades[1].entryScore).toBe(37.25)
  })

  it('returns 400 when initialCapital is not a finite number greater than 0', async () => {
    const candles = makeCandles(70)
    fetchCandlesWithMetaMock.mockResolvedValue({ candles, fetchedAt: Date.now() })
    fetchCandlesMock.mockResolvedValue(candles)

    for (const initialCapital of [0, -1, Number.NaN, 'x']) {
      const req = new NextRequest('http://localhost/api/backtest', {
        method: 'POST',
        body: JSON.stringify({
          assetClass: 'crypto',
          productId: 'ETHUSDT',
          interval: '1w',
          startDate: '2023-01-01',
          endDate: '2024-01-01',
          strategyId: 'volume-momentum-weekly',
          initialCapital,
        }),
      })
      const res = await POST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toMatch(/initialCapital/i)
    }
  })
})
