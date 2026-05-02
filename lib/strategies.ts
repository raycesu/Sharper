import { alignBenchmarkSeriesToAssetTimes } from './benchmark-align'
import { rsi } from './indicators'
import type { Candle, StrategyFn } from './types'

export type StrategyDefinition = {
  id: string
  label: string
  create: (context: StrategyContext) => StrategyFn
}

export type StrategyContext = {
  assetCandles: Candle[]
  benchmarkCandles: Candle[]
}

function createMarketRsiDivergenceStrategy(context: StrategyContext): StrategyFn {
  const assetRsiSeries = rsi(context.assetCandles, 14)
  const benchmarkRsiSeries = rsi(context.benchmarkCandles, 14)
  const alignedBenchmarkRsi = alignBenchmarkSeriesToAssetTimes(
    context.assetCandles,
    context.benchmarkCandles,
    benchmarkRsiSeries,
  )

  let hasCrossed60 = false
  let peakRSI = Number.NEGATIVE_INFINITY
  let weeksBelowPeak = 0

  return (candles, index, position) => {
    if (index <= 0) return 'hold'

    const assetRsi = assetRsiSeries[index]
    const benchmarkRsi = alignedBenchmarkRsi[index]

    if (assetRsi == null || benchmarkRsi == null) {
      return 'hold'
    }

    const relativityIndex = benchmarkRsi - assetRsi

    if (!position.inPosition) {
      hasCrossed60 = false
      peakRSI = Number.NEGATIVE_INFINITY
      weeksBelowPeak = 0

      const hasAbsoluteWeakness = assetRsi < 45
      const hasRelativeGap = benchmarkRsi > assetRsi + 7.5
      const hasMeaningfulDivergence = relativityIndex > 7.5
      if (hasAbsoluteWeakness && hasRelativeGap && hasMeaningfulDivergence) {
        return 'buy'
      }
      return 'hold'
    }

    if (!hasCrossed60 && assetRsi > 60) {
      hasCrossed60 = true
      peakRSI = assetRsi
      weeksBelowPeak = 0
    } else if (hasCrossed60) {
      if (assetRsi > peakRSI) {
        peakRSI = assetRsi
        weeksBelowPeak = 0
      } else if (assetRsi < peakRSI) {
        weeksBelowPeak += 1
      }
    }

    const shouldExitOnRollover = hasCrossed60 && weeksBelowPeak >= 2
    const shouldExitOnRelativityFlip = relativityIndex <= -15
    if (shouldExitOnRollover || shouldExitOnRelativityFlip) {
      hasCrossed60 = false
      peakRSI = Number.NEGATIVE_INFINITY
      weeksBelowPeak = 0
      return 'sell'
    }

    return 'hold'
  }
}

export const STRATEGY_REGISTRY: StrategyDefinition[] = [
  {
    id: 'market-rsi-divergence',
    label: 'Operation Seven-Point Five',
    create: createMarketRsiDivergenceStrategy,
  },
  {
    id: 'volume-momentum-weekly',
    label: 'The Volume Masterpiece',
    create: () => () => 'hold',
  },
]
