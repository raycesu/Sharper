import { NextRequest, NextResponse } from 'next/server'
import { fetchCandles } from '@/lib/coinbase'
import { runBacktest } from '@/lib/engine'
import {
  makeRsiStrategy,
  makeGoldenCrossStrategy,
  makeMacdStrategy,
} from '@/lib/strategies'
import { rsi, ema, macd } from '@/lib/indicators'
import type { OverlayData, TimeValue } from '@/lib/types'
import type { Candle } from '@/lib/coinbase'

function toTimeValues(candles: Candle[], values: (number | null)[]): TimeValue[] {
  return candles
    .map((c, i) => ({ time: c.time, value: values[i] }))
    .filter((p): p is TimeValue => p.value !== null)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      productId = 'BTC-USD',
      interval = '1d',
      startDate,
      endDate,
      strategy = 'rsi',
      initialCapital = 10000,
      rsiOversold = 30,
      rsiOverbought = 70,
      fastPeriod = 50,
      slowPeriod = 200,
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

    const candles = await fetchCandles(productId, interval, startTime, endTime)

    if (candles.length < 50) {
      return NextResponse.json(
        { error: `Not enough candle data for this range (got ${candles.length}, need at least 50)` },
        { status: 400 },
      )
    }

    const strategyFn =
      strategy === 'rsi'
        ? makeRsiStrategy(rsiOversold, rsiOverbought)
        : strategy === 'golden-cross'
          ? makeGoldenCrossStrategy(fastPeriod, slowPeriod)
          : makeMacdStrategy()

    const result = runBacktest(candles, strategyFn, {
      initialCapital,
      positionSizePct: 1.0,
      fee: 0.001,
    })

    // Build overlay data for the price chart
    let overlays: OverlayData
    if (strategy === 'rsi') {
      overlays = {
        strategy: 'rsi',
        rsi: toTimeValues(candles, rsi(candles)),
        oversold: rsiOversold,
        overbought: rsiOverbought,
      }
    } else if (strategy === 'golden-cross') {
      overlays = {
        strategy: 'golden-cross',
        fastEma: toTimeValues(candles, ema(candles, fastPeriod)),
        slowEma:  toTimeValues(candles, ema(candles, slowPeriod)),
      }
    } else {
      const m = macd(candles)
      overlays = {
        strategy: 'macd',
        macdLine:   toTimeValues(candles, m.macdLine),
        signalLine: toTimeValues(candles, m.signalLine),
        histogram:  toTimeValues(candles, m.histogram),
      }
    }

    return NextResponse.json({
      ...result,
      candleCount: candles.length,
      candles,
      overlays,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
