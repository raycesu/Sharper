import { NextRequest, NextResponse } from 'next/server'
import { fetchCandles, CRYPTO_INTERVALS, STOCK_INTERVALS } from '@/lib/market-data'
import { runBacktest } from '@/lib/engine'
import {
  makeRsiStrategy,
  makeGoldenCrossStrategy,
  makeMacdStrategy,
} from '@/lib/strategies'
import { rsi, ema, macd } from '@/lib/indicators'
import type {
  OverlayData,
  TimeValue,
  Candle,
  BacktestApiResponse,
  RunResult,
  StrategyFn,
} from '@/lib/types'

interface StrategyParams {
  rsiOversold: number
  rsiOverbought: number
  fastPeriod: number
  slowPeriod: number
}

function buildStrategy(strategy: string, params: StrategyParams): StrategyFn {
  switch (strategy) {
    case 'rsi':          return makeRsiStrategy(params.rsiOversold, params.rsiOverbought)
    case 'golden-cross': return makeGoldenCrossStrategy(params.fastPeriod, params.slowPeriod)
    default:             return makeMacdStrategy()
  }
}

function toTimeValues(candles: Candle[], values: (number | null)[]): TimeValue[] {
  return candles
    .map((c, i) => ({ time: c.time, value: values[i] }))
    .filter((p): p is TimeValue => p.value !== null)
}

function buildOverlays(strategy: string, params: StrategyParams, candles: Candle[]): OverlayData {
  if (strategy === 'rsi') {
    return {
      strategy: 'rsi',
      rsi: toTimeValues(candles, rsi(candles)),
      oversold:   params.rsiOversold,
      overbought: params.rsiOverbought,
    }
  }
  if (strategy === 'golden-cross') {
    return {
      strategy: 'golden-cross',
      fastEma: toTimeValues(candles, ema(candles, params.fastPeriod)),
      slowEma:  toTimeValues(candles, ema(candles, params.slowPeriod)),
    }
  }
  const m = macd(candles)
  return {
    strategy: 'macd',
    macdLine:   toTimeValues(candles, m.macdLine),
    signalLine: toTimeValues(candles, m.signalLine),
    histogram:  toTimeValues(candles, m.histogram),
  }
}

const STRATEGY_LABELS: Record<string, string> = {
  'rsi':          'RSI',
  'golden-cross': 'Golden Cross',
  'macd':         'MACD',
}

function buildBenchmarkCurve(candles: Candle[], initialCapital: number): TimeValue[] {
  if (candles.length === 0) return []
  const startClose = candles[0].close
  return candles.map(c => ({
    time:  c.time,
    value: initialCapital * (c.close / startClose),
  }))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      assetClass      = 'crypto',
      productId       = 'BTC-USD',
      interval        = '1d',
      startDate,
      endDate,
      strategy        = 'rsi',
      initialCapital  = 10000,
      rsiOversold     = 30,
      rsiOverbought   = 70,
      fastPeriod      = 50,
      slowPeriod      = 200,
      // Optional second strategy for comparison mode
      compareStrategy,
      compareRsiOversold  = 30,
      compareRsiOverbought = 70,
      compareFastPeriod   = 50,
      compareSlowPeriod   = 200,
    } = body

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

    // Validate that the interval is supported for the requested asset class
    const allowedIntervals = assetClass === 'stock' ? STOCK_INTERVALS : CRYPTO_INTERVALS
    if (!allowedIntervals.includes(interval)) {
      return NextResponse.json(
        { error: `Interval "${interval}" is not supported for ${assetClass}. Use one of: ${allowedIntervals.join(', ')}` },
        { status: 400 },
      )
    }

    const intradayIntervals = ['5m', '15m', '1h']

    const candles = await fetchCandles(assetClass, productId, interval, startTime, endTime)

    if (candles.length < 50) {
      const isIntradayStock = assetClass === 'stock' && intradayIntervals.includes(interval)
      const hint = isIntradayStock
        ? ' Intraday history depends on your Twelve Data plan — try a shorter range or use the "1 day" interval.'
        : ''
      return NextResponse.json(
        { error: `Not enough candle data for this range (got ${candles.length}, need at least 50).${hint}` },
        { status: 400 },
      )
    }

    // Primary run
    const primaryParams: StrategyParams = { rsiOversold, rsiOverbought, fastPeriod, slowPeriod }
    const primaryResult = runBacktest(candles, buildStrategy(strategy, primaryParams), {
      initialCapital,
      positionSizePct: 1.0,
      fee: 0.001,
    })

    const runs: RunResult[] = [{
      label:       STRATEGY_LABELS[strategy] ?? strategy,
      trades:      primaryResult.trades,
      equityCurve: primaryResult.equityCurve,
      stats:       primaryResult.stats,
      overlays:    buildOverlays(strategy, primaryParams, candles),
    }]

    // Optional comparison run — runs on identical candles
    if (compareStrategy) {
      const cmpParams: StrategyParams = {
        rsiOversold:  compareRsiOversold,
        rsiOverbought: compareRsiOverbought,
        fastPeriod:   compareFastPeriod,
        slowPeriod:   compareSlowPeriod,
      }
      const cmpResult = runBacktest(candles, buildStrategy(compareStrategy, cmpParams), {
        initialCapital,
        positionSizePct: 1.0,
        fee: 0.001,
      })
      runs.push({
        label:       STRATEGY_LABELS[compareStrategy] ?? compareStrategy,
        trades:      cmpResult.trades,
        equityCurve: cmpResult.equityCurve,
        stats:       cmpResult.stats,
        overlays:    buildOverlays(compareStrategy, cmpParams, candles),
      })
    }

    const response: BacktestApiResponse = {
      runs,
      benchmarkCurve: buildBenchmarkCurve(candles, initialCapital),
      candles,
      candleCount: candles.length,
    }

    return NextResponse.json(response)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
