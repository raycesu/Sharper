import type { Candle, Product } from './types'
import { fetchProducts as fetchCryptoProducts, fetchCandles as fetchCryptoCandles } from './binance'
import {
  fetchStockProducts,
  fetchTwelveDataCandles,
  searchTwelveDataStocks,
} from './twelvedata'

type CacheEntry = {
  candles: Candle[]
  fetchedAt: number
}

const WEEKLY_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const candleCache: Record<string, CacheEntry> = {}

export async function fetchProducts(assetClass: 'crypto' | 'stock'): Promise<Product[]> {
  if (assetClass === 'stock') return fetchStockProducts()
  return fetchCryptoProducts()
}

/** Live symbol search for stocks (Twelve Data). */
export async function searchStockProducts(query: string): Promise<Product[]> {
  return searchTwelveDataStocks(query)
}

/** Fetch OHLCV candles for any supported asset class and interval. */
export async function fetchCandles(
  assetClass: 'crypto' | 'stock',
  symbol:     string,
  interval:   string,
  startMs:    number,
  endMs:      number,
): Promise<Candle[]> {
  const isWeekly = interval === '1w'
  const cacheKey = `${symbol.toUpperCase()}_1W`
  if (isWeekly) {
    const cached = candleCache[cacheKey]
    if (cached && Date.now() - cached.fetchedAt < WEEKLY_CACHE_TTL_MS) {
      return cached.candles
    }
  }

  let candles: Candle[]
  if (assetClass === 'stock') {
    candles = await fetchTwelveDataCandles(symbol, interval, startMs, endMs)
  } else {
    candles = await fetchCryptoCandles(symbol, interval, startMs, endMs)
  }

  if (isWeekly) {
    candleCache[cacheKey] = {
      candles,
      fetchedAt: Date.now(),
    }
  }

  return candles
}

export async function fetchCandlesWithMeta(
  assetClass: 'crypto' | 'stock',
  symbol: string,
  interval: string,
  startMs: number,
  endMs: number,
): Promise<{ candles: Candle[]; fetchedAt: number | null }> {
  const isWeekly = interval === '1w'
  const cacheKey = `${symbol.toUpperCase()}_1W`
  const cached = isWeekly ? candleCache[cacheKey] : undefined

  const candles = await fetchCandles(assetClass, symbol, interval, startMs, endMs)
  const latest = isWeekly ? candleCache[cacheKey] : undefined

  if (latest && latest.candles === candles) {
    return { candles, fetchedAt: latest.fetchedAt }
  }

  if (cached && cached.candles === candles) {
    return { candles, fetchedAt: cached.fetchedAt }
  }

  return { candles, fetchedAt: null }
}

export const CRYPTO_INTERVALS = ['1h', '4h', '1d', '1w']
export const STOCK_INTERVALS  = ['5m', '15m', '1h', '1d', '1w']

export const INTERVAL_LABELS: Record<string, string> = {
  '5m':  '5 min',
  '15m': '15 min',
  '1h':  '1 hour',
  '4h':  '4 hours',
  '1d':  '1 day',
  '1w':  '1 week',
}
