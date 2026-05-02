import { NextRequest, NextResponse } from 'next/server'
import { rsi } from '@/lib/indicators'
import { runBacktest } from '@/lib/engine'
import { fetchCandles, fetchCandlesWithMeta } from '@/lib/market-data'
import { CRYPTO_INTERVALS, STOCK_INTERVALS } from '@/lib/market-data'
import { STRATEGY_REGISTRY } from '@/lib/strategies'
import { scoreCandleArray, type ScoredCandle } from '@/lib/scoreEngine'
import type { BacktestStats, Candle, TimeValue, Trade } from '@/lib/types'

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

function shouldEnterVolumeMomentum(scoredCandles: ScoredCandle[], index: number): boolean {
  const prev = scoredCandles[index - 1]
  const curr = scoredCandles[index]
  if (!prev || !curr || index < 1) return false

  const scoreCross = prev.score < 1.0 && curr.score >= 1.0
  if (!scoreCross) return false

  if (curr.RSI_now == null || curr.RSI_now >= 50) return false
  if (curr.decel_factor <= 1.0) return false
  if (curr.low_10w == null || curr.close > curr.low_10w * 1.2) return false

  return true
}

type RsiRolloverState = {
  rsiArmed: boolean
  peakRSI: number
  consecutiveRSIDeclineWeeks: number
}

const createRsiRolloverState = (): RsiRolloverState => ({
  rsiArmed: false,
  peakRSI: 0,
  consecutiveRSIDeclineWeeks: 0,
})

const updateRsiRolloverState = (state: RsiRolloverState, rsi: number | null | undefined) => {
  if (rsi == null) return

  if (!state.rsiArmed && rsi > 60) {
    state.rsiArmed = true
    state.peakRSI = rsi
  }

  if (state.rsiArmed && rsi > state.peakRSI) {
    state.peakRSI = rsi
    state.consecutiveRSIDeclineWeeks = 0
  }

  if (state.rsiArmed && rsi < state.peakRSI) {
    state.consecutiveRSIDeclineWeeks++
  } else if (state.rsiArmed) {
    state.consecutiveRSIDeclineWeeks = 0
  }
}

const getVolumeMomentumExitReason = (rsiState: RsiRolloverState): 'rsiRollover' | null => {
  if (rsiState.rsiArmed && rsiState.consecutiveRSIDeclineWeeks >= 2) return 'rsiRollover'
  return null
}

function getPositionSize(entryScore: number, totalCapital: number): number {
  if (entryScore >= 1.5) return totalCapital
  if (entryScore >= 1.0) return totalCapital * 0.5
  return 0
}

function calcStats(trades: Trade[], equityCurve: TimeValue[], initialCapital: number): BacktestStats {
  const sellTrades = trades.filter(trade => trade.type === 'sell')
  const winningTrades = sellTrades.filter(trade => (trade.pnl ?? 0) > 0)
  const finalValue = equityCurve[equityCurve.length - 1]?.value ?? initialCapital

  let peak = initialCapital
  let maxDrawdown = 0
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value
    const drawdown = peak > 0 ? (peak - point.value) / peak : 0
    if (drawdown > maxDrawdown) maxDrawdown = drawdown
  }

  let periodsPerYear = 365
  if (equityCurve.length > 1) {
    const totalMs = equityCurve[equityCurve.length - 1].time - equityCurve[0].time
    const avgStepMs = totalMs / (equityCurve.length - 1)
    periodsPerYear = (365.25 * 24 * 3600 * 1000) / avgStepMs
  }
  const annFactor = Math.sqrt(periodsPerYear)

  const returns = equityCurve.slice(1).map((point, i) => {
    const prev = equityCurve[i].value
    return prev > 0 ? (point.value - prev) / prev : 0
  })

  const n = returns.length || 1
  const avgReturn = returns.reduce((sum, value) => sum + value, 0) / n
  const variance = returns.reduce((sum, value) => sum + (value - avgReturn) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annFactor : 0

  const downsideVariance = returns.reduce((sum, value) => sum + (value < 0 ? value ** 2 : 0), 0) / n
  const downsideDev = Math.sqrt(downsideVariance)
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annFactor : 0

  const pnlPcts = sellTrades.map(trade => trade.pnlPct ?? 0)

  return {
    totalReturn: ((finalValue - initialCapital) / initialCapital) * 100,
    totalReturnAbs: finalValue - initialCapital,
    winRate: sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0,
    totalTrades: sellTrades.length,
    maxDrawdown: maxDrawdown * 100,
    sharpeRatio,
    sortinoRatio,
    bestTrade: pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0,
    worstTrade: pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0,
  }
}

function runVolumeMomentumBacktest(
  scoredCandles: ScoredCandle[],
  initialCapital: number,
  fee: number,
): { trades: Trade[]; equityCurve: TimeValue[]; stats: BacktestStats } {
  let cash = initialCapital
  let holdings = 0
  let inPosition = false
  let entryPrice = 0
  let entryValue = 0
  let currentEntryScore = 0
  let currentSizePct = 0
  let rsiRolloverState = createRsiRolloverState()

  const trades: Trade[] = []
  const equityCurve: TimeValue[] = []

  for (let i = 1; i < scoredCandles.length; i++) {
    const candle = scoredCandles[i]

    if (!inPosition) {
      if (shouldEnterVolumeMomentum(scoredCandles, i - 1)) {
        const signalCandle = scoredCandles[i - 1]
        const entryScore = signalCandle.score
        const size = getPositionSize(entryScore, cash)
        if (size > 0) {
          const feeAmount = size * fee
          const quantity = (size - feeAmount) / candle.open
          cash -= size
          holdings = quantity
          inPosition = true
          entryPrice = candle.open
          entryValue = size
          currentEntryScore = entryScore
          currentSizePct = initialCapital > 0 ? (size / initialCapital) * 100 : 0
          rsiRolloverState = createRsiRolloverState()
          trades.push({
            type: 'buy',
            price: candle.open,
            quantity,
            time: candle.time,
            value: size,
            entryScore,
            sizePct: currentSizePct,
          })
        }
      }
    } else {
      const signalCandle = scoredCandles[i - 1]
      updateRsiRolloverState(rsiRolloverState, signalCandle.RSI_now)
      const exitReason = getVolumeMomentumExitReason(rsiRolloverState)
      if (exitReason) {
        const grossValue = holdings * candle.open
        const feeAmount = grossValue * fee
        const proceeds = grossValue - feeAmount
        const pnl = proceeds - entryValue
        const pnlPct = entryValue > 0 ? (pnl / entryValue) * 100 : 0

        cash += proceeds
        trades.push({
          type: 'sell',
          price: candle.open,
          quantity: holdings,
          time: candle.time,
          value: proceeds,
          pnl,
          pnlPct,
          entryScore: currentEntryScore,
          sizePct: currentSizePct,
          exitReason,
        })

        holdings = 0
        inPosition = false
        entryPrice = 0
        entryValue = 0
        currentEntryScore = 0
        currentSizePct = 0
        rsiRolloverState = createRsiRolloverState()
      }
    }

    equityCurve.push({
      time: candle.time,
      value: cash + holdings * candle.close,
    })
  }

  if (inPosition && scoredCandles.length > 0) {
    const lastCandle = scoredCandles[scoredCandles.length - 1]
    const grossValue = holdings * lastCandle.close
    const feeAmount = grossValue * fee
    const proceeds = grossValue - feeAmount
    const pnl = proceeds - entryValue
    const pnlPct = entryValue > 0 ? (pnl / entryValue) * 100 : 0

    cash += proceeds
    trades.push({
      type: 'sell',
      price: lastCandle.close,
      quantity: holdings,
      time: lastCandle.time,
      value: proceeds,
      pnl,
      pnlPct,
      entryScore: currentEntryScore,
      sizePct: currentSizePct,
      exitReason: 'forcedClose',
    })

    if (equityCurve.length > 0) {
      equityCurve[equityCurve.length - 1].value = cash
    } else {
      equityCurve.push({ time: lastCandle.time, value: cash })
    }
  }

  return {
    trades,
    equityCurve,
    stats: calcStats(trades, equityCurve, initialCapital),
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
    } = body
    const isWeeklyOnlyStrategy = WEEKLY_ONLY_STRATEGY_IDS.has(strategyId)
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

    const { candles, fetchedAt } = await fetchCandlesWithMeta(
      assetClass,
      productId,
      resolvedInterval,
      startTime,
      endTime,
    )
    const minRequiredCandles = strategyId === 'volume-momentum-weekly' ? 15 : 20
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

    const initialCapitalNumber = Number(initialCapital)
    const fee = 0.001

    let result: { trades: Trade[]; equityCurve: TimeValue[]; stats: BacktestStats }
    let overlays:
      | {
          strategy: 'rsi'
          rsi: TimeValue[]
          oversold: number
          overbought: number
        }
      | {
          strategy: 'score'
          score: Array<TimeValue & { spikeDetected?: boolean }>
          scoreStrong: number
          scoreEntry: number
          scoreExit: number
          zero: number
        }

    if (strategyId === 'volume-momentum-weekly') {
      const scoredCandles = scoreCandleArray(candles)
      result = runVolumeMomentumBacktest(scoredCandles, initialCapitalNumber, fee)
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
        initialCapital: initialCapitalNumber,
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

    const benchmarkCurve = buildBenchmarkCurve(candles, benchmarkCandles, initialCapitalNumber)

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
      dataAsOf: fetchedAt,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
