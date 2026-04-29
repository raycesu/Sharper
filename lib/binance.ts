import type { Candle, Product } from './types'

const MAX_CANDLES_PER_REQUEST = 1000
const BINANCE_VENUES = [
  'https://api.binance.com',
  'https://api.binance.us',
] as const

const INTERVAL_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '6h': '6h',
  '1d': '1d',
  '1w': '1w',
}

const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '6h': 21_600_000,
  '1d': 86_400_000,
  '1w': 604_800_000,
}

const QUOTE_PRIORITY = ['USDT', 'USD', 'USDC', 'BTC']
const FULL_SYMBOL_REGEX = /^[A-Z0-9]{6,20}$/

type BinanceExchangeSymbol = {
  symbol: string
  status: string
  baseAsset: string
  quoteAsset: string
  isSpotTradingAllowed: boolean
}

type VenueSymbol = BinanceExchangeSymbol & {
  venue: (typeof BINANCE_VENUES)[number]
}

type ExchangeInfoResponse = {
  symbols?: BinanceExchangeSymbol[]
}

type Kline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  string,
  string,
  string,
  string,
]

const venueExchangeInfoCache = new Map<string, BinanceExchangeSymbol[]>()

function cleanSymbolInput(input: string): string {
  return input.trim().toUpperCase().replace(/[-_/]/g, '')
}

function buildQuoteList(quotes: string[]): string[] {
  const preferred = QUOTE_PRIORITY.filter(quote => quotes.includes(quote))
  const remainder = quotes.filter(quote => !preferred.includes(quote))
  return [...preferred, ...remainder]
}

async function fetchExchangeInfoForVenue(venue: string): Promise<BinanceExchangeSymbol[]> {
  const cached = venueExchangeInfoCache.get(venue)
  if (cached) return cached

  const url = `${venue}/api/v3/exchangeInfo`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    // Response payload is >2MB, so opt out of Next fetch cache
    // and rely on venueExchangeInfoCache for process-level reuse.
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Binance exchangeInfo API error ${res.status} (${venue})`)
  }

  const json = (await res.json()) as ExchangeInfoResponse
  const tradingSymbols = (json.symbols ?? []).filter(
    symbol => symbol.status === 'TRADING' && symbol.isSpotTradingAllowed,
  )

  venueExchangeInfoCache.set(venue, tradingSymbols)
  return tradingSymbols
}

async function fetchExchangeInfo(): Promise<VenueSymbol[]> {
  const allSymbols: VenueSymbol[] = []
  const dedupe = new Set<string>()

  for (const venue of BINANCE_VENUES) {
    const symbols = await fetchExchangeInfoForVenue(venue)
    for (const symbol of symbols) {
      const dedupeKey = `${venue}:${symbol.symbol}`
      if (dedupe.has(dedupeKey)) continue
      dedupe.add(dedupeKey)
      allSymbols.push({ ...symbol, venue })
    }
  }

  return allSymbols
}

async function resolveBinanceSymbol(input: string): Promise<{ symbol: string; venue: string }> {
  const exchangeSymbols = await fetchExchangeInfo()
  const raw = input.trim().toUpperCase()
  const cleaned = cleanSymbolInput(raw)

  // Prefer global venue for direct symbol hits, then Binance US
  for (const venue of BINANCE_VENUES) {
    const directHit = exchangeSymbols.find(symbol => symbol.symbol === cleaned && symbol.venue === venue)
    if (directHit) return { symbol: directHit.symbol, venue: directHit.venue }
  }

  const baseFromSeparated = raw.split(/[-_/]/)[0]?.trim().toUpperCase()
  const baseCandidate = baseFromSeparated && baseFromSeparated.length > 0
    ? baseFromSeparated
    : FULL_SYMBOL_REGEX.test(cleaned)
      ? cleaned
      : cleaned

  const matches = exchangeSymbols.filter(symbol => symbol.baseAsset === baseCandidate)
  if (matches.length === 0) {
    throw new Error(`No Binance spot symbol found for "${input}"`)
  }

  const availableQuotes = Array.from(new Set(matches.map(symbol => symbol.quoteAsset)))
  const orderedQuotes = buildQuoteList(availableQuotes)

  for (const quote of orderedQuotes) {
    for (const venue of BINANCE_VENUES) {
      const symbol = matches.find(match => match.quoteAsset === quote && match.venue === venue)
      if (symbol) return { symbol: symbol.symbol, venue: symbol.venue }
    }
  }

  return { symbol: matches[0].symbol, venue: matches[0].venue }
}

export async function fetchProducts(): Promise<Product[]> {
  const exchangeSymbols = await fetchExchangeInfo()
  const groupedByBase = new Map<string, VenueSymbol[]>()

  for (const symbol of exchangeSymbols) {
    const current = groupedByBase.get(symbol.baseAsset) ?? []
    current.push(symbol)
    groupedByBase.set(symbol.baseAsset, current)
  }

  const products: Product[] = []

  for (const [base, symbols] of groupedByBase.entries()) {
    const availableQuotes = Array.from(new Set(symbols.map(symbol => symbol.quoteAsset)))
    const orderedQuotes = buildQuoteList(availableQuotes)

    let selected = symbols[0]
    for (const quote of orderedQuotes) {
      for (const venue of BINANCE_VENUES) {
        const match = symbols.find(symbol => symbol.quoteAsset === quote && symbol.venue === venue)
        if (match) {
          selected = match
          break
        }
      }
      if (selected.quoteAsset === quote) break
    }

    products.push({
      id: selected.symbol,
      baseName: base,
      base,
      assetClass: 'crypto',
    })
  }

  return products.sort((a, b) => a.baseName.localeCompare(b.baseName))
}

async function fetchKlineChunk(
  venue: string,
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  const url = new URL(`${venue}/api/v3/klines`)
  url.searchParams.set('symbol', symbol)
  url.searchParams.set('interval', interval)
  url.searchParams.set('startTime', String(startTime))
  url.searchParams.set('endTime', String(endTime))
  url.searchParams.set('limit', String(MAX_CANDLES_PER_REQUEST))

  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Binance klines API error ${res.status} (${venue}): ${text}`)
  }

  const data = (await res.json()) as Kline[]

  return data.map(candle => ({
    time: candle[0],
    open: parseFloat(candle[1]),
    high: parseFloat(candle[2]),
    low: parseFloat(candle[3]),
    close: parseFloat(candle[4]),
    volume: parseFloat(candle[5]),
    quoteVolume: parseFloat(candle[7]),
  }))
}

export async function fetchCandles(
  productId: string,
  interval: string,
  startTime: number,
  endTime: number,
): Promise<Candle[]> {
  const mappedInterval = INTERVAL_MAP[interval]
  const intervalMs = INTERVAL_MS[interval]

  if (!mappedInterval || !intervalMs) {
    throw new Error(`Unsupported Binance interval: ${interval}`)
  }
  if (startTime >= endTime) return []

  const resolved = await resolveBinanceSymbol(productId)
  const allCandles: Candle[] = []
  let cursor = startTime

  while (cursor < endTime) {
    const chunk = await fetchKlineChunk(resolved.venue, resolved.symbol, mappedInterval, cursor, endTime)
    if (chunk.length === 0) break

    allCandles.push(...chunk)

    const lastCandleTime = chunk[chunk.length - 1].time
    const nextCursor = lastCandleTime + intervalMs
    if (nextCursor <= cursor) break
    cursor = nextCursor

    if (chunk.length < MAX_CANDLES_PER_REQUEST) break
  }

  const seen = new Set<number>()
  const deduped = allCandles.filter(candle => {
    if (seen.has(candle.time)) return false
    seen.add(candle.time)
    return true
  })

  deduped.sort((a, b) => a.time - b.time)
  return deduped
}
