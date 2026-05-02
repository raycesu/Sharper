import type { Candle } from './types'

/** Latest benchmark candle with `time <= assetTimeMs` (sorted ascending benchmark series). */
export const pickBenchmarkCandleAsOf = (
  benchmarkCandles: Candle[],
  assetTimeMs: number,
): Candle | undefined => {
  if (benchmarkCandles.length === 0) return undefined
  let lo = 0
  let hi = benchmarkCandles.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (benchmarkCandles[mid].time <= assetTimeMs) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans < 0 ? undefined : benchmarkCandles[ans]
}

/** For each asset bar, value from the latest benchmark bar at or before that asset time. */
export const alignBenchmarkSeriesToAssetTimes = (
  assetCandles: Candle[],
  benchmarkCandles: Candle[],
  benchmarkValues: (number | null)[],
): (number | null)[] => {
  const out: (number | null)[] = []
  let j = -1
  for (const ac of assetCandles) {
    while (j + 1 < benchmarkCandles.length && benchmarkCandles[j + 1].time <= ac.time) {
      j++
    }
    out.push(j < 0 ? null : benchmarkValues[j])
  }
  return out
}
