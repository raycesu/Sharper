import { describe, expect, it } from 'vitest'
import { alignBenchmarkSeriesToAssetTimes, pickBenchmarkCandleAsOf } from './benchmark-align'
import type { Candle } from './types'

const mk = (time: number): Candle => ({
  time,
  open: 1,
  high: 1,
  low: 1,
  close: 1,
  volume: 1,
})

describe('pickBenchmarkCandleAsOf', () => {
  it('returns undefined when no bar is on or before asset time', () => {
    const bench = [mk(100), mk(200)]
    expect(pickBenchmarkCandleAsOf(bench, 99)).toBeUndefined()
  })

  it('returns exact match when times align', () => {
    const bench = [mk(100), mk(200), mk(300)]
    expect(pickBenchmarkCandleAsOf(bench, 200)?.time).toBe(200)
  })

  it('returns latest benchmark bar at or before asset time', () => {
    const bench = [mk(100), mk(200), mk(300)]
    expect(pickBenchmarkCandleAsOf(bench, 150)?.time).toBe(100)
    expect(pickBenchmarkCandleAsOf(bench, 250)?.time).toBe(200)
    expect(pickBenchmarkCandleAsOf(bench, 400)?.time).toBe(300)
  })
})

describe('alignBenchmarkSeriesToAssetTimes', () => {
  it('aligns benchmark values with backward as-of times', () => {
    const asset = [mk(100), mk(200), mk(350)]
    const bench = [mk(80), mk(180), mk(280)]
    const vals = [1, 2, 3] as (number | null)[]
    expect(alignBenchmarkSeriesToAssetTimes(asset, bench, vals)).toEqual([1, 2, 3])
  })

  it('returns null when asset is before first benchmark', () => {
    const asset = [mk(50)]
    const bench = [mk(100)]
    expect(alignBenchmarkSeriesToAssetTimes(asset, bench, [42])).toEqual([null])
  })
})
