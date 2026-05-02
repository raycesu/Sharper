import { calcStats } from '@/lib/backtest-stats'
import type { ScoredCandle } from '@/lib/scoreEngine'
import type { BacktestStats, TimeValue, Trade } from '@/lib/types'

export const shouldEnterVolumeMomentum = (scoredCandles: ScoredCandle[], index: number): boolean => {
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

const updateRsiRolloverState = (state: RsiRolloverState, rsiValue: number | null | undefined) => {
  if (rsiValue == null) return

  if (!state.rsiArmed && rsiValue > 60) {
    state.rsiArmed = true
    state.peakRSI = rsiValue
  }

  if (state.rsiArmed && rsiValue > state.peakRSI) {
    state.peakRSI = rsiValue
    state.consecutiveRSIDeclineWeeks = 0
  }

  if (state.rsiArmed && rsiValue < state.peakRSI) {
    state.consecutiveRSIDeclineWeeks++
  } else if (state.rsiArmed) {
    state.consecutiveRSIDeclineWeeks = 0
  }
}

const getVolumeMomentumExitReason = (rsiState: RsiRolloverState): 'rsiRollover' | null => {
  if (rsiState.rsiArmed && rsiState.consecutiveRSIDeclineWeeks >= 2) return 'rsiRollover'
  return null
}

/** Position notional from **available cash** (partial deploy leaves cash on hand by design). */
export const getPositionSizeForEntry = (entryScore: number, availableCash: number): number => {
  if (entryScore >= 1.5) return availableCash
  if (entryScore >= 1.0) return availableCash * 0.5
  return 0
}

export const runVolumeMomentumBacktest = (
  scoredCandles: ScoredCandle[],
  initialCapital: number,
  fee: number,
): { trades: Trade[]; equityCurve: TimeValue[]; stats: BacktestStats } => {
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

  if (scoredCandles.length > 0) {
    const first = scoredCandles[0]
    equityCurve.push({
      time: first.time,
      value: initialCapital,
    })
  }

  for (let i = 1; i < scoredCandles.length; i++) {
    const candle = scoredCandles[i]

    if (!inPosition) {
      if (shouldEnterVolumeMomentum(scoredCandles, i - 1)) {
        const signalCandle = scoredCandles[i - 1]
        const entryScore = signalCandle.score
        const size = getPositionSizeForEntry(entryScore, cash)
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
      updateRsiRolloverState(rsiRolloverState, scoredCandles[i - 1].RSI_now)
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
