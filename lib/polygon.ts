/**
 * Polygon.io stock data provider.
 *
 * Requires the POLYGON_API_KEY environment variable.
 * Free tier: 5 requests/min, unlimited history for daily bars,
 * up to 2 years of intraday bars.
 * Sign up at https://polygon.io (free plan available).
 */

import type { Candle, Product } from './types'

const API_KEY = process.env.POLYGON_API_KEY ?? ''
const BASE    = 'https://api.polygon.io'

const INTERVAL_MAP: Record<string, { multiplier: number; timespan: string }> = {
  '5m':  { multiplier: 5,  timespan: 'minute' },
  '15m': { multiplier: 15, timespan: 'minute' },
  '1h':  { multiplier: 1,  timespan: 'hour' },
  '1d':  { multiplier: 1,  timespan: 'day' },
}

export async function searchPolygonStocks(query: string): Promise<Product[]> {
  const url = new URL(`${BASE}/v3/reference/tickers`)
  url.searchParams.set('search', query)
  url.searchParams.set('active', 'true')
  url.searchParams.set('market', 'stocks')
  url.searchParams.set('limit', '20')
  url.searchParams.set('apiKey', API_KEY)

  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  if (!res.ok) return []

  const json = await res.json()
  type TickerResult = { ticker: string; name?: string }
  return (json.results ?? []).map((r: TickerResult) => ({
    id:         r.ticker,
    base:       r.ticker,
    baseName:   r.name ?? r.ticker,
    assetClass: 'stock' as const,
  }))
}

export async function fetchPolygonCandles(
  symbol:  string,
  interval: string,
  startMs:  number,
  endMs:    number,
): Promise<Candle[]> {
  const mapping = INTERVAL_MAP[interval]
  if (!mapping) throw new Error(`Unsupported interval for Polygon: ${interval}`)

  const { multiplier, timespan } = mapping
  const startDate = new Date(startMs).toISOString().split('T')[0]
  const endDate   = new Date(endMs).toISOString().split('T')[0]

  const url = new URL(
    `${BASE}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${multiplier}/${timespan}/${startDate}/${endDate}`,
  )
  url.searchParams.set('adjusted', 'true')
  url.searchParams.set('sort', 'asc')
  url.searchParams.set('limit', '50000')
  url.searchParams.set('apiKey', API_KEY)

  const res = await fetch(url.toString(), { next: { revalidate: 0 } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Polygon API error ${res.status}: ${text.slice(0, 300)}`)
  }

  const json = await res.json()
  if (json.status === 'ERROR' || json.status === 'NOT_AUTHORIZED') {
    throw new Error(
      `Polygon: ${json.message ?? json.status} — check POLYGON_API_KEY`,
    )
  }

  type Bar = { o: number; h: number; l: number; c: number; v: number; t: number }
  return (json.results ?? []).map((r: Bar) => ({
    time:   r.t,
    open:   r.o,
    high:   r.h,
    low:    r.l,
    close:  r.c,
    volume: r.v,
  }))
}
