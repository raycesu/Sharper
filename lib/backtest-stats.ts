import type { BacktestStats, TimeValue, Trade } from './types'

export const calcStats = (
  trades: Trade[],
  equityCurve: TimeValue[],
  initialCapital: number,
): BacktestStats => {
  const sellTrades = trades.filter(t => t.type === 'sell')
  const winningTrades = sellTrades.filter(t => (t.pnl ?? 0) > 0)
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

  const returns = equityCurve.slice(1).map((p, i) => {
    const prev = equityCurve[i].value
    return prev > 0 ? (p.value - prev) / prev : 0
  })

  const n = returns.length || 1
  const avgReturn = returns.reduce((s, r) => s + r, 0) / n
  const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / n
  const stdDev = Math.sqrt(variance)
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * annFactor : 0

  const downsideVariance = returns.reduce((s, r) => s + (r < 0 ? r ** 2 : 0), 0) / n
  const downsideDev = Math.sqrt(downsideVariance)
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev) * annFactor : 0

  const pnlPcts = sellTrades.map(t => t.pnlPct ?? 0)

  return {
    totalReturn: ((finalValue - initialCapital) / initialCapital) * 100,
    totalReturnAbs: finalValue - initialCapital,
    winRate: sellTrades.length > 0 ? (winningTrades.length / sellTrades.length) * 100 : 0,
    totalTrades: sellTrades.length,
    maxDrawdown: maxDrawdown * 100,
    sharpeRatio,
    sortinoRatio,
    bestTrade:  pnlPcts.length > 0 ? Math.max(...pnlPcts) : 0,
    worstTrade: pnlPcts.length > 0 ? Math.min(...pnlPcts) : 0,
  }
}
