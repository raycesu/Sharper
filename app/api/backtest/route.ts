import { NextRequest, NextResponse } from 'next/server'
import { rsi } from '@/lib/indicators'
import { runBacktest } from '@/lib/engine'
import { fetchCandles } from '@/lib/market-data'
import { CRYPTO_INTERVALS, STOCK_INTERVALS } from '@/lib/market-data'
import { STRATEGY_REGISTRY } from '@/lib/strategies'
import type { Candle, TimeValue } from '@/lib/types'

function normalizeCryptoBaseSymbol(productId: string): string {
  const normalized = productId.trim().toUpperCase().replace(/[-_/]/g, '')
  const quotes = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'BNB']

  for (const quote of quotes) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      return normalized.slice(0, -quote.length)
    }
  }

  return normalized
}

function resolveBenchmark(
  assetClass: 'crypto' | 'stock',
  productId: string,
): { assetClass: 'crypto' | 'stock'; productId: string } {
  if (assetClass === 'stock') {
    return { assetClass: 'stock', productId: 'SPY' }
  }

  const base = normalizeCryptoBaseSymbol(productId)
  if (base === 'BTC') {
    return { assetClass: 'stock', productId: 'SPY' }
  }

  return { assetClass: 'crypto', productId: 'BTCUSDT' }
}

function buildBenchmarkCurve(
  assetCandles: Candle[],
  benchmarkCandles: Candle[],
  initialCapital: number,
): TimeValue[] {
  if (assetCandles.length === 0 || benchmarkCandles.length === 0) return []

  const benchmarkByTime = new Map<number, Candle>()
  for (const candle of benchmarkCandles) benchmarkByTime.set(candle.time, candle)

  const firstBenchmark = benchmarkByTime.get(assetCandles[0].time)
  if (!firstBenchmark) return []

  const initialPrice = firstBenchmark.close
  return assetCandles
    .map(candle => {
      const benchmark = benchmarkByTime.get(candle.time)
      if (!benchmark) return null
      const growth = benchmark.close / initialPrice
      return { time: candle.time, value: initialCapital * growth }
    })
    .filter((value): value is TimeValue => value !== null)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      assetClass      = 'crypto',
      productId       = 'BTCUSDT',
      interval        = '1d',
      startDate,
      endDate,
      initialCapital  = 10000,
      strategyId      = 'market-rsi-divergence',
    } = body
    const isWeeklyOnlyStrategy = strategyId === 'market-rsi-divergence'
    const resolvedInterval = isWeeklyOnlyStrategy ? '1w' : interval

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    }

    const startTime = new Date(startDate).getTime()
    const endTime   = new Date(endDate).getTime()

    if (isNaN(startTime) || isNaN(endTime)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }
    if (startTime >= endTime) {
      return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 })
    }

    const allowedIntervals = assetClass === 'stock' ? STOCK_INTERVALS : CRYPTO_INTERVALS
    if (!allowedIntervals.includes(resolvedInterval)) {
      return NextResponse.json(
        { error: `Interval "${resolvedInterval}" is not supported for ${assetClass}. Use one of: ${allowedIntervals.join(', ')}` },
        { status: 400 },
      )
    }

    const selectedStrategy = STRATEGY_REGISTRY.find(strategy => strategy.id === strategyId)
    if (!selectedStrategy) {
      return NextResponse.json(
        { error: `Unknown strategy "${strategyId}"` },
        { status: 400 },
      )
    }

    const candles = await fetchCandles(assetClass, productId, resolvedInterval, startTime, endTime)
    if (candles.length < 20) {
      return NextResponse.json(
        { error: 'Not enough candle data to run this strategy for the requested range' },
        { status: 400 },
      )
    }

    const benchmarkTarget = resolveBenchmark(assetClass, productId)
    const benchmarkCandles = await fetchCandles(
      benchmarkTarget.assetClass,
      benchmarkTarget.productId,
      resolvedInterval,
      startTime,
      endTime,
    )

    if (benchmarkCandles.length < 20) {
      return NextResponse.json(
        { error: 'Not enough benchmark data to run this strategy for the requested range' },
        { status: 400 },
      )
    }

    const strategy = selectedStrategy.create({
      assetCandles: candles,
      benchmarkCandles,
    })

    const result = runBacktest(candles, strategy, {
      initialCapital: Number(initialCapital),
      positionSizePct: 1,
      fee: 0.001,
    })

    const rsiSeries = rsi(candles, 14)
    const overlays = {
      strategy: 'rsi' as const,
      rsi: candles
        .map((candle, index) => {
          const value = rsiSeries[index]
          if (value == null) return null
          return { time: candle.time, value }
        })
        .filter((value): value is TimeValue => value !== null),
      oversold: 40,
      overbought: 60,
    }

    const benchmarkCurve = buildBenchmarkCurve(candles, benchmarkCandles, Number(initialCapital))

    return NextResponse.json({
      runs: [
        {
          label: selectedStrategy.label,
          trades: result.trades,
          equityCurve: result.equityCurve,
          stats: result.stats,
          overlays,
        },
      ],
      benchmarkCurve,
      candles,
      candleCount: candles.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
