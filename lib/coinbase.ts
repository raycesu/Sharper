import type { Candle, Product } from './types'

// Re-export for backward compatibility
export type { Candle, Product }

// Coinbase Advanced Trade public candles endpoint supports these granularities
const GRANULARITY_MAP: Record<string, string> = {
  '1m':  'ONE_MINUTE',
  '5m':  'FIVE_MINUTE',
  '15m': 'FIFTEEN_MINUTE',
  '1h':  'ONE_HOUR',
  '4h':  'FOUR_HOUR',
  '6h':  'SIX_HOUR',
  '1d':  'ONE_DAY',
}

// Returns the number of seconds per candle for the given interval key
const SECONDS_PER_INTERVAL: Record<string, number> = {
  '1m':    60,
  '5m':   300,
  '15m':  900,
  '1h':  3600,
  '4h': 14400,
  '6h': 21600,
  '1d': 86400,
}

const MAX_CANDLES_PER_REQUEST = 350
const BASE_URL = 'https://api.coinbase.com/api/v3/brokerage/market/products'

export async function fetchProducts(): Promise<Product[]> {
  const url = new URL(`${BASE_URL}`)
  url.searchParams.set('product_type', 'SPOT')
  url.searchParams.set('limit', '1000')

  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 3600 },
  })
  if (!res.ok) {
    throw new Error(`Coinbase products API error ${res.status}`)
  }

  const json = await res.json()
  const raw: Array<{
    product_id: string
    base_name: string
    base_currency_id: string
    quote_currency_id: string
    status: string
    product_type: string
  }> = json.products ?? []

  return raw
    .filter(p => p.quote_currency_id === 'USD' && p.status === 'online' && p.product_type === 'SPOT')
    .map(p => ({
      id: p.product_id,
      baseName: p.base_name ?? p.base_currency_id,
      base: p.base_currency_id,
      assetClass: 'crypto' as const,
    }))
    .sort((a, b) => a.baseName.localeCompare(b.baseName))
}

async function fetchChunk(
  productId: string,
  granularity: string,
  startSec: number,
  endSec: number,
): Promise<Candle[]> {
  const url = new URL(`${BASE_URL}/${productId}/candles`)
  url.searchParams.set('granularity', granularity)
  url.searchParams.set('start', startSec.toString())
  url.searchParams.set('end', endSec.toString())

  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Coinbase API error ${res.status}: ${text}`)
  }

  const json = await res.json()
  const raw: Array<{
    start: string
    low: string
    high: string
    open: string
    close: string
    volume: string
  }> = json.candles ?? []

  return raw.map(c => ({
    time:   Number(c.start) * 1000,
    open:   parseFloat(c.open),
    high:   parseFloat(c.high),
    low:    parseFloat(c.low),
    close:  parseFloat(c.close),
    volume: parseFloat(c.volume),
  }))
}

export async function fetchCandles(
  productId: string,   // e.g. "BTC-USD"
  interval: string,    // e.g. "1d"
  startTime: number,   // Unix ms
  endTime: number,     // Unix ms
): Promise<Candle[]> {
  const granularity = GRANULARITY_MAP[interval]
  if (!granularity) throw new Error(`Unsupported interval: ${interval}`)

  const secondsPerCandle = SECONDS_PER_INTERVAL[interval]
  const chunkSeconds = MAX_CANDLES_PER_REQUEST * secondsPerCandle

  let cursor = Math.floor(startTime / 1000)
  const endSec = Math.floor(endTime / 1000)
  const allCandles: Candle[] = []

  while (cursor < endSec) {
    const chunkEnd = Math.min(cursor + chunkSeconds, endSec)
    const chunk = await fetchChunk(productId, granularity, cursor, chunkEnd)
    allCandles.push(...chunk)
    cursor = chunkEnd
    if (chunk.length < MAX_CANDLES_PER_REQUEST) break
  }

  // Deduplicate and sort ascending by time
  const seen = new Set<number>()
  const deduped = allCandles.filter(c => {
    if (seen.has(c.time)) return false
    seen.add(c.time)
    return true
  })
  deduped.sort((a, b) => a.time - b.time)
  return deduped
}
