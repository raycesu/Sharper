import type { Candle, Product } from './types'

// ── Yahoo Finance request identity ─────────────────────────────────────────
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BASE_HEADERS = {
  'User-Agent':      UA,
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Parse `Retry-After` as seconds or HTTP-date; returns wait duration in ms. */
function parseRetryAfterMs(headers: Headers): number | null {
  const ra = headers.get('retry-after')
  if (!ra) return null
  const sec = Number.parseInt(ra, 10)
  if (!Number.isNaN(sec)) return sec * 1000
  const when = Date.parse(ra)
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now())
  return null
}

// Space out Yahoo calls — bursty traffic from dev reloads / compare mode triggers 429.
let lastYahooRequestAt = 0
const YAHOO_MIN_GAP_MS = 400

async function throttleYahoo(): Promise<void> {
  const gap = lastYahooRequestAt + YAHOO_MIN_GAP_MS - Date.now()
  if (gap > 0) await sleep(gap)
  lastYahooRequestAt = Date.now()
}

// ── Crumb / session cookie cache ───────────────────────────────────────────
// Yahoo Finance requires a session cookie + crumb parameter on the chart API.
// We fetch them once per process and cache for 25 minutes.
type CrumbSession = { crumb: string; cookie: string; fetchedAt: number }
let _session: CrumbSession | null = null

/**
 * Extract all Set-Cookie values from a Response.
 * Uses getSetCookie() (Node 18.14+ / undici) with a graceful fallback.
 */
function extractSetCookies(headers: Headers): string[] {
  const h = headers as unknown as { getSetCookie?: () => string[] }
  if (typeof h.getSetCookie === 'function') return h.getSetCookie()
  const raw = headers.get('set-cookie') ?? ''
  return raw ? [raw] : []
}

/**
 * Return a valid Yahoo Finance crumb + cookie, fetching fresh ones if needed.
 * The session is reused across requests for the lifetime of the server process.
 */
async function ensureSession(): Promise<CrumbSession> {
  if (_session && Date.now() - _session.fetchedAt < 25 * 60 * 1000) {
    return _session
  }

  const maxAttempts = 6
  let lastError = 'Unknown error'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await throttleYahoo()
    const cookieRes = await fetch('https://fc.yahoo.com/', {
      headers: { ...BASE_HEADERS, 'Accept': '*/*' },
      redirect: 'follow',
    })
    if (cookieRes.status === 429) {
      await sleep(parseRetryAfterMs(cookieRes.headers) ?? Math.min(20_000, 1200 * 2 ** (attempt - 1) + Math.random() * 500))
      continue
    }
    if (!cookieRes.ok) {
      lastError = `cookie step HTTP ${cookieRes.status}`
      await sleep(Math.min(10_000, 800 * 2 ** (attempt - 1)))
      continue
    }

    const rawCookies = extractSetCookies(cookieRes.headers)
    const cookie = rawCookies.map(c => c.split(';')[0]).join('; ')

    await throttleYahoo()
    const crumbRes = await fetch(
      'https://query1.finance.yahoo.com/v1/test/getcrumb',
      { headers: { ...BASE_HEADERS, 'Cookie': cookie } },
    )
    if (crumbRes.status === 429) {
      await sleep(parseRetryAfterMs(crumbRes.headers) ?? Math.min(20_000, 1200 * 2 ** (attempt - 1) + Math.random() * 500))
      continue
    }
    const crumb = (await crumbRes.text()).trim()

    if (!crumb || crumb.startsWith('<') || crumb.length > 30) {
      lastError = 'invalid or empty crumb response'
      await sleep(Math.min(15_000, 1000 * 2 ** (attempt - 1) + Math.random() * 400))
      continue
    }

    _session = { crumb, cookie, fetchedAt: Date.now() }
    return _session
  }

  throw new Error(
    'Could not obtain Yahoo Finance session after retries (' + lastError + '). ' +
      'Yahoo Finance may be rate-limiting this IP (HTTP 429). Wait a few minutes, ' +
      'or set POLYGON_API_KEY for stock data from Polygon instead.',
  )
}

/** Invalidate the cached session so the next call fetches a fresh one. */
function invalidateSession() { _session = null }

// ── Chart response parser ──────────────────────────────────────────────────
function parseChartJson(json: unknown): Candle[] {
  const j = json as {
    chart?: {
      result?: Array<{
        timestamp?: number[]
        indicators?: { quote?: Array<Record<string, (number | null)[]>> }
      }>
      error?: { description?: string }
    }
  }
  const result = j?.chart?.result?.[0]
  if (!result) {
    const errMsg = j?.chart?.error?.description ?? 'No data returned from Yahoo Finance'
    throw new Error(`Yahoo Finance: ${errMsg}`)
  }

  const timestamps: number[]           = result.timestamp ?? []
  const q                               = result.indicators?.quote?.[0] ?? {}
  const opens:   (number | null)[]     = q.open   ?? []
  const highs:   (number | null)[]     = q.high   ?? []
  const lows:    (number | null)[]     = q.low    ?? []
  const closes:  (number | null)[]     = q.close  ?? []
  const volumes: (number | null)[]     = q.volume ?? []

  const candles: Candle[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i]; const h = highs[i]; const l = lows[i]; const c = closes[i]
    if (o == null || h == null || l == null || c == null) continue
    candles.push({ time: timestamps[i] * 1000, open: o, high: h, low: l, close: c, volume: volumes[i] ?? 0 })
  }
  candles.sort((a, b) => a.time - b.time)
  return candles
}

// ── Interval mapping ───────────────────────────────────────────────────────
const INTERVAL_MAP: Record<string, string> = {
  '5m':  '5m',
  '15m': '15m',
  '1h':  '60m',
  '1d':  '1d',
}

export const STOCK_SUPPORTED_INTERVALS = ['5m', '15m', '1h', '1d']

// ── Curated stock universe (shown before the user types anything) ──────────
const STOCK_UNIVERSE: Product[] = [
  // ETFs & Indices
  { id: 'SPY',   base: 'SPY',   baseName: 'S&P 500 ETF',          assetClass: 'stock' },
  { id: 'QQQ',   base: 'QQQ',   baseName: 'Nasdaq 100 ETF',        assetClass: 'stock' },
  { id: 'IWM',   base: 'IWM',   baseName: 'Russell 2000 ETF',      assetClass: 'stock' },
  { id: 'DIA',   base: 'DIA',   baseName: 'Dow Jones ETF',         assetClass: 'stock' },
  { id: 'GLD',   base: 'GLD',   baseName: 'Gold ETF',              assetClass: 'stock' },
  { id: 'TLT',   base: 'TLT',   baseName: '20+ Year Treasury ETF', assetClass: 'stock' },
  // Tech
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
  // Finance
  { id: 'JPM',   base: 'JPM',   baseName: 'JPMorgan Chase',        assetClass: 'stock' },
  { id: 'GS',    base: 'GS',    baseName: 'Goldman Sachs',         assetClass: 'stock' },
  { id: 'BAC',   base: 'BAC',   baseName: 'Bank of America',       assetClass: 'stock' },
  { id: 'BRK-B', base: 'BRK-B', baseName: 'Berkshire Hathaway',   assetClass: 'stock' },
  { id: 'V',     base: 'V',     baseName: 'Visa',                  assetClass: 'stock' },
  { id: 'MA',    base: 'MA',    baseName: 'Mastercard',            assetClass: 'stock' },
  // Healthcare
  { id: 'JNJ',   base: 'JNJ',   baseName: 'Johnson & Johnson',     assetClass: 'stock' },
  { id: 'UNH',   base: 'UNH',   baseName: 'UnitedHealth',          assetClass: 'stock' },
  { id: 'PFE',   base: 'PFE',   baseName: 'Pfizer',                assetClass: 'stock' },
  { id: 'ABBV',  base: 'ABBV',  baseName: 'AbbVie',                assetClass: 'stock' },
  { id: 'LLY',   base: 'LLY',   baseName: 'Eli Lilly',             assetClass: 'stock' },
  // Energy
  { id: 'XOM',   base: 'XOM',   baseName: 'ExxonMobil',            assetClass: 'stock' },
  { id: 'CVX',   base: 'CVX',   baseName: 'Chevron',               assetClass: 'stock' },
  // Consumer
  { id: 'WMT',   base: 'WMT',   baseName: 'Walmart',               assetClass: 'stock' },
  { id: 'COST',  base: 'COST',  baseName: 'Costco',                assetClass: 'stock' },
  { id: 'PG',    base: 'PG',    baseName: 'Procter & Gamble',      assetClass: 'stock' },
  { id: 'KO',    base: 'KO',    baseName: 'Coca-Cola',             assetClass: 'stock' },
  { id: 'MCD',   base: 'MCD',   baseName: "McDonald's",            assetClass: 'stock' },
  // Other
  { id: 'DIS',   base: 'DIS',   baseName: 'Walt Disney',           assetClass: 'stock' },
  { id: 'NKE',   base: 'NKE',   baseName: 'Nike',                  assetClass: 'stock' },
  { id: 'BA',    base: 'BA',    baseName: 'Boeing',                assetClass: 'stock' },
  { id: 'CAT',   base: 'CAT',   baseName: 'Caterpillar',           assetClass: 'stock' },
  { id: 'UPS',   base: 'UPS',   baseName: 'UPS',                   assetClass: 'stock' },
]

export function fetchStockProducts(): Product[] {
  return STOCK_UNIVERSE
}

// ── Live symbol search ─────────────────────────────────────────────────────
export async function searchYahooStocks(query: string): Promise<Product[]> {
  if (!query.trim()) return STOCK_UNIVERSE

  const url = new URL('https://query2.finance.yahoo.com/v1/finance/search')
  url.searchParams.set('q', query.trim())
  url.searchParams.set('quotesCount', '15')
  url.searchParams.set('newsCount', '0')
  url.searchParams.set('enableFuzzyQuery', 'false')

  try {
    const res = await fetch(url.toString(), {
      headers: BASE_HEADERS,
      next: { revalidate: 60 },
    })
    if (!res.ok) return []

    const json = await res.json() as {
      quotes?: Array<{ symbol: string; shortname?: string; longname?: string; quoteType?: string }>
    }

    return (json.quotes ?? [])
      .filter(q => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
      .slice(0, 15)
      .map(q => ({
        id:         q.symbol,
        base:       q.symbol,
        baseName:   q.shortname ?? q.longname ?? q.symbol,
        assetClass: 'stock' as const,
      }))
  } catch {
    return []
  }
}

// ── OHLCV candles ──────────────────────────────────────────────────────────
export async function fetchStockCandles(
  symbol:   string,
  interval: string,
  startMs:  number,
  endMs:    number,
): Promise<Candle[]> {
  const yahooInterval = INTERVAL_MAP[interval]
  if (!yahooInterval) throw new Error(`Unsupported stock interval: ${interval}`)

  const startSec = Math.floor(startMs / 1000)
  const endSec   = Math.floor(endMs   / 1000)

  const buildUrl = (crumb: string) => {
    const u = new URL(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
    )
    u.searchParams.set('interval',       yahooInterval)
    u.searchParams.set('period1',        startSec.toString())
    u.searchParams.set('period2',        endSec.toString())
    u.searchParams.set('includePrePost', 'false')
    u.searchParams.set('crumb',          crumb)
    return u.toString()
  }

  const doFetch = async (session: CrumbSession) =>
    fetch(buildUrl(session.crumb), {
      headers: { ...BASE_HEADERS, 'Cookie': session.cookie },
      next: { revalidate: 0 },
    })

  const maxAttempts = 7
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await throttleYahoo()
    const session = await ensureSession()
    const res     = await doFetch(session)

    if (res.ok) return parseChartJson(await res.json())

    const errBody = await res.text()

    if (res.status === 401) {
      invalidateSession()
      continue
    }

    if (res.status === 429 && attempt < maxAttempts) {
      const wait =
        parseRetryAfterMs(res.headers) ??
        Math.min(25_000, 1800 * 2 ** (attempt - 1) + Math.random() * 600)
      await sleep(wait)
      // Refreshing the session adds more Yahoo calls; only do it occasionally.
      if (attempt % 3 === 0) invalidateSession()
      continue
    }

    throw new Error(`Yahoo Finance API error ${res.status}: ${errBody.slice(0, 300)}`)
  }

  throw new Error(
    'Yahoo Finance API error 429: Too Many Requests — rate limit persisted after retries. ' +
      'Wait several minutes or set POLYGON_API_KEY for a dedicated data provider.',
  )
}
