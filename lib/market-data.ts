import type { Candle, Product } from './types'
import { fetchProducts as fetchCryptoProducts, fetchCandles as fetchCryptoCandles } from './binance'
import {
  fetchStockProducts,
  fetchTwelveDataCandles,
  searchTwelveDataStocks,
} from './twelvedata'

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
  if (assetClass === 'stock') {
    return fetchTwelveDataCandles(symbol, interval, startMs, endMs)
  }
  return fetchCryptoCandles(symbol, interval, startMs, endMs)
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
