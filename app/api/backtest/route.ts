import { NextRequest, NextResponse } from 'next/server'
import { pickBenchmarkCandleAsOf } from '@/lib/benchmark-align'
import { rsi } from '@/lib/indicators'
import { runBacktest } from '@/lib/engine'
import { fetchCandles, fetchCandlesWithMeta } from '@/lib/market-data'
import { CRYPTO_INTERVALS, STOCK_INTERVALS } from '@/lib/market-data'
import { scoreCandleArray } from '@/lib/scoreEngine'
import { STRATEGY_REGISTRY } from '@/lib/strategies'
import { runVolumeMomentumBacktest } from '@/lib/volume-momentum-engine'
import type { BacktestStats, Candle, RunResult, TimeValue, Trade } from '@/lib/types'

/** All registered strategies use weekly candles; API and UI force `1w` when any of these is selected. */
const WEEKLY_ONLY_STRATEGY_IDS = new Set(['market-rsi-divergence', 'volume-momentum-weekly'])

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

  const firstBench = pickBenchmarkCandleAsOf(benchmarkCandles, assetCandles[0].time)
  if (!firstBench) return []

  const initialPrice = firstBench.close
  const out: TimeValue[] = []
  for (const candle of assetCandles) {
    const benchmark = pickBenchmarkCandleAsOf(benchmarkCandles, candle.time)
    if (!benchmark) continue
    const growth = benchmark.close / initialPrice
    out.push({ time: candle.time, value: initialCapital * growth })
  }
  return out
}

function minCandlesRequired(strategyId: string): number {
  return strategyId === 'volume-momentum-weekly' ? 15 : 20
}

function buildRunResult(
  strategyId: string,
  candles: Candle[],
  benchmarkCandles: Candle[],
  initialCapital: number,
  fee: number,
): RunResult {
  const selectedStrategy = STRATEGY_REGISTRY.find(strategy => strategy.id === strategyId)
  if (!selectedStrategy) {
    throw new Error(`Unknown strategy "${strategyId}"`)
  }

  let result: { trades: Trade[]; equityCurve: TimeValue[]; stats: BacktestStats }
  let overlays: RunResult['overlays']

  if (strategyId === 'volume-momentum-weekly') {
    const scoredCandles = scoreCandleArray(candles)
    result = runVolumeMomentumBacktest(scoredCandles, initialCapital, fee)
    overlays = {
      strategy: 'score',
      score: scoredCandles.map(candle => ({
        time: candle.time,
        value: candle.score,
      })),
      scoreStrong: 1.5,
      scoreEntry: 1.0,
      scoreExit: -0.5,
      zero: 0,
    }
  } else {
    const strategy = selectedStrategy.create({
      assetCandles: candles,
      benchmarkCandles,
    })

    result = runBacktest(candles, strategy, {
      initialCapital,
      positionSizePct: 1,
      fee,
    })

    const rsiSeries = rsi(candles, 14)
    overlays = {
      strategy: 'rsi',
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
  }

  return {
    label: selectedStrategy.label,
    trades: result.trades,
    equityCurve: result.equityCurve,
    stats: result.stats,
    overlays,
  }
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
      compareStrategyId: rawCompareId,
    } = body
    const compareStrategyId =
      typeof rawCompareId === 'string' && rawCompareId.trim().length > 0
        ? rawCompareId.trim()
        : null

    const needsWeeklyInterval =
      WEEKLY_ONLY_STRATEGY_IDS.has(strategyId)
      || (compareStrategyId != null && WEEKLY_ONLY_STRATEGY_IDS.has(compareStrategyId))
    const resolvedInterval = needsWeeklyInterval ? '1w' : interval

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

    const initialCapitalNumber = Number(initialCapital)
    if (!Number.isFinite(initialCapitalNumber) || initialCapitalNumber <= 0) {
      return NextResponse.json(
        { error: 'initialCapital must be a finite number greater than 0' },
        { status: 400 },
      )
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

    const compareSelected =
      compareStrategyId != null && compareStrategyId !== strategyId
        ? STRATEGY_REGISTRY.find(strategy => strategy.id === compareStrategyId)
        : null
    if (compareStrategyId != null && compareStrategyId !== strategyId && !compareSelected) {
      return NextResponse.json(
        { error: `Unknown compare strategy "${compareStrategyId}"` },
        { status: 400 },
      )
    }

    const { candles, fetchedAt } = await fetchCandlesWithMeta(
      assetClass,
      productId,
      resolvedInterval,
      startTime,
      endTime,
    )
    let minRequiredCandles = minCandlesRequired(strategyId)
    if (compareSelected) {
      minRequiredCandles = Math.max(minRequiredCandles, minCandlesRequired(compareStrategyId!))
    }
    if (candles.length < minRequiredCandles) {
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

    const fee = 0.001

    const primaryRun = buildRunResult(strategyId, candles, benchmarkCandles, initialCapitalNumber, fee)
    const runs: RunResult[] = [primaryRun]
    if (compareSelected) {
      runs.push(
        buildRunResult(compareStrategyId!, candles, benchmarkCandles, initialCapitalNumber, fee),
      )
    }

    const benchmarkCurve = buildBenchmarkCurve(candles, benchmarkCandles, initialCapitalNumber)

    return NextResponse.json({
      runs,
      benchmarkCurve,
      candles,
      candleCount: candles.length,
      dataAsOf: fetchedAt,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
