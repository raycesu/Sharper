/**
 * Twelve Data stock provider (https://twelvedata.com).
 * Set TWELVE_DATA_API_KEY in the environment (e.g. .env.local or Vercel).
 */

import type { Candle, Product } from './types'

const BASE = 'https://api.twelvedata.com'

const API_KEY = () => (process.env.TWELVE_DATA_API_KEY ?? '').trim()

/** Map app interval keys → Twelve Data `interval` values. */
const INTERVAL_MAP: Record<string, string> = {
  '5m':  '5min',
  '15m': '15min',
  '1h':  '1h',
  '1d':  '1day',
  '1w':  '1week',
}

const INTERVAL_STEP_MS: Record<string, number> = {
  '5min':  5 * 60 * 1000,
  '15min': 15 * 60 * 1000,
  '1h':    60 * 60 * 1000,
  '1day':  24 * 60 * 60 * 1000,
  '1week': 7 * 24 * 60 * 60 * 1000,
}

// ── Curated stock universe (shown before the user types anything) ──────────
const STOCK_UNIVERSE: Product[] = [
  { id: 'SPY',   base: 'SPY',   baseName: 'S&P 500 ETF',          assetClass: 'stock' },
  { id: 'QQQ',   base: 'QQQ',   baseName: 'Nasdaq 100 ETF',        assetClass: 'stock' },
  { id: 'IWM',   base: 'IWM',   baseName: 'Russell 2000 ETF',      assetClass: 'stock' },
  { id: 'DIA',   base: 'DIA',   baseName: 'Dow Jones ETF',         assetClass: 'stock' },
  { id: 'GLD',   base: 'GLD',   baseName: 'Gold ETF',              assetClass: 'stock' },
  { id: 'TLT',   base: 'TLT',   baseName: '20+ Year Treasury ETF', assetClass: 'stock' },
  { id: 'AAPL',  base: 'AAPL',  baseName: 'Apple',                 assetClass: 'stock' },
  { id: 'MSFT',  base: 'MSFT',  baseName: 'Microsoft',             assetClass: 'stock' },
  { id: 'NVDA',  base: 'NVDA',  baseName: 'Nvidia',                assetClass: 'stock' },
  { id: 'GOOGL', base: 'GOOGL', baseName: 'Alphabet',              assetClass: 'stock' },
  { id: 'META',  base: 'META',  baseName: 'Meta',                  assetClass: 'stock' },
  { id: 'AMZN',  base: 'AMZN',  baseName: 'Amazon',                assetClass: 'stock' },
  { id: 'TSLA',  base: 'TSLA',  baseName: 'Tesla',                 assetClass: 'stock' },
  { id: 'NFLX',  base: 'NFLX',  baseName: 'Netflix',               assetClass: 'stock' },
  { id: 'AMD',   base: 'AMD',   baseName: 'AMD',                   assetClass: 'stock' },
  { id: 'INTC',  base: 'INTC',  baseName: 'Intel',                 assetClass: 'stock' },
  { id: 'ORCL',  base: 'ORCL',  baseName: 'Oracle',                assetClass: 'stock' },
  { id: 'CRM',   base: 'CRM',   baseName: 'Salesforce',            assetClass: 'stock' },
  { id: 'ADBE',  base: 'ADBE',  baseName: 'Adobe',                 assetClass: 'stock' },
  { id: 'NOW',   base: 'NOW',   baseName: 'ServiceNow',            assetClass: 'stock' },
  { id: 'JPM',   base: 'JPM',   baseName: 'JPMorgan Chase',        assetClass: 'stock' },
  { id: 'GS',    base: 'GS',    baseName: 'Goldman Sachs',         assetClass: 'stock' },
  { id: 'BAC',   base: 'BAC',   baseName: 'Bank of America',       assetClass: 'stock' },
  { id: 'BRK-B', base: 'BRK-B', baseName: 'Berkshire Hathaway',   assetClass: 'stock' },
  { id: 'V',     base: 'V',     baseName: 'Visa',                  assetClass: 'stock' },
  { id: 'MA',    base: 'MA',    baseName: 'Mastercard',            assetClass: 'stock' },
  { id: 'JNJ',   base: 'JNJ',   baseName: 'Johnson & Johnson',     assetClass: 'stock' },
  { id: 'UNH',   base: 'UNH',   baseName: 'UnitedHealth',          assetClass: 'stock' },
  { id: 'PFE',   base: 'PFE',   baseName: 'Pfizer',                assetClass: 'stock' },
  { id: 'ABBV',  base: 'ABBV',  baseName: 'AbbVie',                assetClass: 'stock' },
  { id: 'LLY',   base: 'LLY',   baseName: 'Eli Lilly',             assetClass: 'stock' },
  { id: 'XOM',   base: 'XOM',   baseName: 'ExxonMobil',            assetClass: 'stock' },
  { id: 'CVX',   base: 'CVX',   baseName: 'Chevron',               assetClass: 'stock' },
  { id: 'WMT',   base: 'WMT',   baseName: 'Walmart',               assetClass: 'stock' },
  { id: 'COST',  base: 'COST',  baseName: 'Costco',                assetClass: 'stock' },
  { id: 'PG',    base: 'PG',    baseName: 'Procter & Gamble',      assetClass: 'stock' },
  { id: 'KO',    base: 'KO',    baseName: 'Coca-Cola',             assetClass: 'stock' },
  { id: 'MCD',   base: 'MCD',   baseName: "McDonald's",            assetClass: 'stock' },
  { id: 'DIS',   base: 'DIS',   baseName: 'Walt Disney',           assetClass: 'stock' },
  { id: 'NKE',   base: 'NKE',   baseName: 'Nike',                  assetClass: 'stock' },
  { id: 'BA',    base: 'BA',    baseName: 'Boeing',                assetClass: 'stock' },
  { id: 'CAT',   base: 'CAT',   baseName: 'Caterpillar',           assetClass: 'stock' },
  { id: 'UPS',   base: 'UPS',   baseName: 'UPS',                   assetClass: 'stock' },
]

export function fetchStockProducts(): Product[] {
  return STOCK_UNIVERSE
}

function requireApiKey(): string {
  const k = API_KEY()
  if (!k) {
    throw new Error(
      'Twelve Data API key missing — set TWELVE_DATA_API_KEY in the environment.',
    )
  }
  return k
}

/** Parse API datetime into Unix ms; request uses timezone=UTC so values are UTC wall times. */
function parseRowTimeMs(datetime: string): number {
  if (/^\d{4}-\d{2}-\d{2}$/.test(datetime)) {
    return Date.parse(`${datetime}T00:00:00.000Z`)
  }
  const iso = datetime.includes('T') ? datetime : datetime.replace(' ', 'T')
  return Date.parse(`${iso}Z`)
}

function toUtcApiDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

function nextCursorMs(lastDatetime: string, tdInterval: string): number {
  const step = INTERVAL_STEP_MS[tdInterval]
  if (!step) return parseRowTimeMs(lastDatetime) + 60_000

  if (tdInterval === '1day') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lastDatetime.trim())
    if (m) {
      const y = Number(m[1]); const mo = Number(m[2]); const d = Number(m[3])
      return Date.UTC(y, mo - 1, d + 1)
    }
  }
  return parseRowTimeMs(lastDatetime) + step
}

type TsRow = {
  datetime: string
  open:     string
  high:     string
  low:      string
  close:    string
  volume?:  string
}

function rowsToCandles(rows: TsRow[]): Candle[] {
  return rows.map(r => ({
    time:   parseRowTimeMs(r.datetime),
    open:   Number.parseFloat(r.open),
    high:   Number.parseFloat(r.high),
    low:    Number.parseFloat(r.low),
    close:  Number.parseFloat(r.close),
    volume: Number.parseFloat(r.volume ?? '0') || 0,
  }))
}

export async function searchTwelveDataStocks(query: string): Promise<Product[]> {
  const q = query.trim()
  if (!q) return STOCK_UNIVERSE

  const key = API_KEY()
  if (!key) return []

  const url = new URL(`${BASE}/symbol_search`)
  url.searchParams.set('symbol', q)
  url.searchParams.set('outputsize', '40')
  url.searchParams.set('apikey', key)

  const res = await fetch(url.toString(), { next: { revalidate: 60 } })
  if (!res.ok) return []

  const json = (await res.json()) as {
    status?: string
    data?: Array<{
      symbol:           string
      instrument_name?: string
      country?:         string
    }>
  }
  if (json.status === 'error' || !json.data?.length) return []

  const seen = new Set<string>()
  const out: Product[] = []
  for (const row of json.data) {
    if (row.country !== 'United States') continue
    if (seen.has(row.symbol)) continue
    seen.add(row.symbol)
    out.push({
      id:         row.symbol,
      base:       row.symbol,
      baseName:   row.instrument_name ?? row.symbol,
      assetClass: 'stock',
    })
    if (out.length >= 20) break
  }
  return out
}

const MAX_PAGES = 100

export async function fetchTwelveDataCandles(
  symbol:   string,
  interval: string,
  startMs:  number,
  endMs:    number,
): Promise<Candle[]> {
  const tdInterval = INTERVAL_MAP[interval]
  if (!tdInterval) throw new Error(`Unsupported stock interval: ${interval}`)

  const key = requireApiKey()
  const byTime = new Map<number, Candle>()
  let cursor = startMs
  let pages = 0

  while (cursor < endMs && pages < MAX_PAGES) {
    pages++
    const url = new URL(`${BASE}/time_series`)
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('interval', tdInterval)
    url.searchParams.set('apikey', key)
    url.searchParams.set('timezone', 'UTC')
    url.searchParams.set('order', 'asc')
    url.searchParams.set('outputsize', '5000')
    url.searchParams.set('start_date', toUtcApiDateTime(cursor))
    url.searchParams.set('end_date', toUtcApiDateTime(endMs))

    const res = await fetch(url.toString(), { next: { revalidate: 0 } })
    const text = await res.text()
    let json: {
      status?: string
      message?: string
      code?: number
      values?: TsRow[]
    }
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      throw new Error(`Twelve Data: invalid JSON (${res.status}): ${text.slice(0, 200)}`)
    }

    if (json.status === 'error') {
      throw new Error(
        `Twelve Data: ${json.message ?? 'request failed'}${json.code != null ? ` (${json.code})` : ''}`,
      )
    }
    if (!res.ok) {
      throw new Error(`Twelve Data HTTP ${res.status}: ${text.slice(0, 300)}`)
    }

    const values = json.values ?? []
    if (values.length === 0) break

    for (const c of rowsToCandles(values)) {
      if (c.time >= startMs && c.time <= endMs) byTime.set(c.time, c)
    }

    const lastRow = values[values.length - 1]
    const lastMs = parseRowTimeMs(lastRow.datetime)
    if (lastMs >= endMs || values.length < 5000) break

    const nextMs = nextCursorMs(lastRow.datetime, tdInterval)
    if (nextMs <= cursor) break
    cursor = nextMs
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time)
}
