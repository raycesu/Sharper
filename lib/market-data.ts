import type { Candle, Product } from './types'
import { fetchProducts as fetchCryptoProducts, fetchCandles as fetchCryptoCandles } from './coinbase'
import { fetchStockProducts, fetchStockCandles, searchYahooStocks } from './yahoo'
import { searchPolygonStocks, fetchPolygonCandles } from './polygon'

/** True when a Polygon API key has been configured server-side. */
const usePolygon = () => Boolean(process.env.POLYGON_API_KEY)

export async function fetchProducts(assetClass: 'crypto' | 'stock'): Promise<Product[]> {
  if (assetClass === 'stock') return fetchStockProducts()
  return fetchCryptoProducts()
}

/**
 * Live symbol search for stocks.
 * Uses Polygon.io when POLYGON_API_KEY is set, Yahoo Finance otherwise.
 */
export async function searchStockProducts(query: string): Promise<Product[]> {
  if (usePolygon()) return searchPolygonStocks(query)
  return searchYahooStocks(query)
}

/**
 * Fetch OHLCV candles for any supported asset class and interval.
 * Stock candles go through Polygon.io if POLYGON_API_KEY is set,
 * otherwise fall back to Yahoo Finance.
 */
export async function fetchCandles(
  assetClass: 'crypto' | 'stock',
  symbol:     string,
  interval:   string,
  startMs:    number,
  endMs:      number,
): Promise<Candle[]> {
  if (assetClass === 'stock') {
    if (usePolygon()) return fetchPolygonCandles(symbol, interval, startMs, endMs)
    return fetchStockCandles(symbol, interval, startMs, endMs)
  }
  return fetchCryptoCandles(symbol, interval, startMs, endMs)
}

export const CRYPTO_INTERVALS = ['1h', '4h', '1d']
export const STOCK_INTERVALS  = ['5m', '15m', '1h', '1d']

export const INTERVAL_LABELS: Record<string, string> = {
  '5m':  '5 min',
  '15m': '15 min',
  '1h':  '1 hour',
  '4h':  '4 hours',
  '1d':  '1 day',
}
