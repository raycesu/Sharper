'use client'

import { useState, useMemo, useEffect } from 'react'
import dynamic from 'next/dynamic'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
  CartesianGrid,
} from 'recharts'
import InstrumentSelector from '@/components/InstrumentSelector'
import type { BacktestApiResponse, BacktestStats, RunResult } from '@/lib/types'
import { CRYPTO_INTERVALS, INTERVAL_LABELS, STOCK_INTERVALS } from '@/lib/market-data'
import { STRATEGY_REGISTRY } from '@/lib/strategies'

const PriceChart = dynamic(() => import('@/components/PriceChart'), { ssr: false })
const WEEKLY_INTERVAL = '1w'
const WEEKLY_ONLY_STRATEGY_IDS = new Set(['market-rsi-divergence', 'volume-momentum-weekly'])
const ASSET_CLASSES = [
  { label: 'Crypto', value: 'crypto' as const },
  { label: 'Stocks', value: 'stock'  as const },
]

const FIELD_LABEL =
  'mb-1.5 block text-[12px] font-normal tracking-[0.03em] text-[#555568]'

/** Results / charts (after backtest) — hex literals inlined for Tailwind */
const RESULT_CARD =
  'relative overflow-visible rounded-[10px] border border-[#1E1E2A] bg-[#111116] p-4'
const CHART_SHELL = 'rounded-xl border border-[#1E1E2A] bg-[#111116]'

// ── Metric explanations ────────────────────────────────────────────────────
const METRIC_HINTS = {
  sharpe:
    'Annualised return ÷ total return volatility (std dev). Penalises all price swings equally. '
    + '> 1 is acceptable · > 2 is strong · > 3 is excellent.',
  sortino:
    'Like Sharpe but only penalises downside volatility (losses). '
    + 'Ignores beneficial upside moves — so it is usually higher than Sharpe for the same strategy. '
    + '> 1 is good · > 2 is strong.',
}

function MetricHint({ text }: { text: string }) {
  return (
    <span className="group/hint relative inline-flex items-center ml-1 cursor-help">
      <span className="text-[10px] text-foreground/25 group-hover/hint:text-brand/60 transition-colors select-none leading-none">
        ⓘ
      </span>
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute z-50',
          'top-full left-1/2 -translate-x-1/2 mt-2',
          'w-56 px-3 py-2.5 rounded-xl text-[11px] leading-relaxed',
          'normal-case tracking-normal font-normal',
          'bg-surface-raised border border-border text-foreground shadow-lg',
          'opacity-0 group-hover/hint:opacity-100 transition-opacity duration-150',
        ].join(' ')}
      >
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[-1px] border-[5px] border-transparent border-b-surface-raised" />
        {text}
      </span>
    </span>
  )
}

// ── Stats card grid ────────────────────────────────────────────────────────
function fmt(n: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtPct(n: number) { return `${n >= 0 ? '+' : ''}${fmt(n)}%` }

type StatCardProps = {
  label:  string
  value:  string
  sub?:   string
  color?: string
  hint?:  string
}

function StatCard({ label, value, sub, color, hint }: StatCardProps) {
  return (
    <div className={RESULT_CARD}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] bg-gradient-to-r from-[#6B8EFF] to-[#7C5CFC]"
      />
      <div className="relative">
        <div className="mb-1.5 flex items-center text-[11px] font-normal tracking-[0.05em] text-[#555568]">
          <span>{label}</span>
          {hint && <MetricHint text={hint} />}
        </div>
        <div className={`text-[22px] font-semibold leading-tight tracking-tight ${color ?? 'text-[#F0F0F8]'}`}>
          {value}
        </div>
        {sub && <div className="mt-1 text-[11px] text-[#555568]">{sub}</div>}
      </div>
    </div>
  )
}

function StatsGrid({ stats, initialCapital }: { stats: BacktestStats; initialCapital: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-2">
      <StatCard
        label="Total return"
        value={fmtPct(stats.totalReturn)}
        sub={`${stats.totalReturnAbs >= 0 ? '+' : ''}$${fmt(stats.totalReturnAbs)}`}
        color={stats.totalReturn >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}
      />
      <StatCard label="Win rate"     value={`${fmt(stats.winRate)}%`}             sub={`${stats.totalTrades} trades`} />
      <StatCard label="Max drawdown" value={`${fmt(stats.maxDrawdown)}%`}         color="text-[#F87171]" />
      <StatCard label="Sharpe ratio"  value={fmt(stats.sharpeRatio)}  sub="annualised" hint={METRIC_HINTS.sharpe} />
      <StatCard label="Sortino ratio" value={fmt(stats.sortinoRatio)} sub="annualised" hint={METRIC_HINTS.sortino} />
      <StatCard label="Best trade"   value={fmtPct(stats.bestTrade)}              color="text-[#4ADE80]" />
      <StatCard label="Worst trade"  value={fmtPct(stats.worstTrade)}             color="text-[#F87171]" />
      <StatCard
        label="Starting capital"
        value={`$${fmt(initialCapital)}`}
        sub={`→ $${fmt(initialCapital + stats.totalReturnAbs)}`}
      />
    </div>
  )
}

type CompareStatsProps = {
  runs:           RunResult[]
  initialCapital: number
}

function CompareStats({ runs, initialCapital }: CompareStatsProps) {
  const [a, b] = runs
  const RUN_COLORS = ['#6B8EFF', '#7C5CFC'] as const

  type StatRow = {
    label:   string
    aVal:    string
    bVal:    string
    aColor?: string
    bColor?: string
    hint?:   string
  }

  const rows: StatRow[] = [
    {
      label:  'Total return',
      aVal:   fmtPct(a.stats.totalReturn),
      bVal:   fmtPct(b.stats.totalReturn),
      aColor: a.stats.totalReturn >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]',
      bColor: b.stats.totalReturn >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]',
    },
    {
      label:  'Abs. P&L',
      aVal:   `${a.stats.totalReturnAbs >= 0 ? '+' : ''}$${fmt(a.stats.totalReturnAbs)}`,
      bVal:   `${b.stats.totalReturnAbs >= 0 ? '+' : ''}$${fmt(b.stats.totalReturnAbs)}`,
      aColor: a.stats.totalReturnAbs >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]',
      bColor: b.stats.totalReturnAbs >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]',
    },
    { label: 'Win rate',     aVal: `${fmt(a.stats.winRate)}%`,      bVal: `${fmt(b.stats.winRate)}%` },
    { label: 'Total trades', aVal: String(a.stats.totalTrades),     bVal: String(b.stats.totalTrades) },
    { label: 'Max drawdown', aVal: `${fmt(a.stats.maxDrawdown)}%`,  bVal: `${fmt(b.stats.maxDrawdown)}%`, aColor: 'text-[#F87171]', bColor: 'text-[#F87171]' },
    { label: 'Sharpe ratio',  aVal: fmt(a.stats.sharpeRatio),  bVal: fmt(b.stats.sharpeRatio),  hint: METRIC_HINTS.sharpe  },
    { label: 'Sortino ratio', aVal: fmt(a.stats.sortinoRatio), bVal: fmt(b.stats.sortinoRatio), hint: METRIC_HINTS.sortino },
    { label: 'Best trade',   aVal: fmtPct(a.stats.bestTrade),  bVal: fmtPct(b.stats.bestTrade),  aColor: 'text-[#4ADE80]', bColor: 'text-[#4ADE80]' },
    { label: 'Worst trade',  aVal: fmtPct(a.stats.worstTrade), bVal: fmtPct(b.stats.worstTrade), aColor: 'text-[#F87171]', bColor: 'text-[#F87171]' },
    {
      label: 'Final equity',
      aVal:  `$${fmt(initialCapital + a.stats.totalReturnAbs)}`,
      bVal:  `$${fmt(initialCapital + b.stats.totalReturnAbs)}`,
    },
  ]

  return (
    <div className="overflow-x-auto mb-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-normal uppercase tracking-[0.05em] text-[#555568]">
            <th className="text-left pb-3 pr-4">Metric</th>
            <th className="text-right pb-3 pr-4">
              <span style={{ color: RUN_COLORS[0] }}>{a.label}</span>
            </th>
            <th className="text-right pb-3">
              <span style={{ color: RUN_COLORS[1] }}>{b.label}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-t border-[#1E1E2A]">
              <td className="py-2 pr-4">
                <span className="text-[#555568]">{row.label}</span>
                {row.hint && <MetricHint text={row.hint} />}
              </td>
              <td className={`py-2 text-right pr-4 text-[15px] font-semibold ${row.aColor ?? 'text-[#F0F0F8]'}`}>{row.aVal}</td>
              <td className={`py-2 text-right text-[15px] font-semibold ${row.bColor ?? 'text-[#F0F0F8]'}`}>{row.bVal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Equity curve chart ─────────────────────────────────────────────────────
type EquityChartProps = {
  result:         BacktestApiResponse
  initialCapital: number
  compareMode:    boolean
}

function EquityChart({ result, initialCapital, compareMode }: EquityChartProps) {
  const data = useMemo(() => {
    const primary   = result.runs[0].equityCurve
    const secondary = result.runs[1]?.equityCurve
    const bench     = result.benchmarkCurve

    return primary.map((p, i) => ({
      time:      p.time,
      primary:   p.value,
      secondary: secondary?.[i]?.value,
      benchmark: bench[i]?.value,
    }))
  }, [result])

  const tickFmt = (v: number) => `$${(v / 1000).toFixed(0)}k`

  const tooltipStyle = {
    background:   '#111116',
    border:       '1px solid #1E1E2A',
    borderRadius: 12,
    color:          '#555568',
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#1E1E2A" />
        <XAxis dataKey="time" hide />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: '#555568', fontSize: 11 }}
          width={68}
          tickFormatter={tickFmt}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: unknown, name: unknown) => {
            const key = name as string
            const label =
              key === 'primary'
                ? result.runs[0].label
                : key === 'secondary'
                  ? result.runs[1]?.label ?? 'Strategy 2'
                  : 'Buy & Hold'
            return [`$${fmt(v as number)}`, label] as [string, string]
          }}
          labelFormatter={t => new Date(t as number).toLocaleDateString()}
        />
        <Legend
          formatter={value =>
            value === 'primary'
              ? result.runs[0].label
              : value === 'secondary'
                ? result.runs[1]?.label ?? 'Strategy 2'
                : 'Buy & Hold'
          }
          wrapperStyle={{ fontSize: 11, color: '#555568' }}
        />
        <ReferenceLine y={initialCapital} stroke="#1E1E2A" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="primary" stroke="#6B8EFF" dot={false} strokeWidth={1.5} />
        {compareMode && (
          <Line type="monotone" dataKey="secondary" stroke="#7C5CFC" dot={false} strokeWidth={1.5} />
        )}
        <Line
          type="monotone"
          dataKey="benchmark"
          stroke="#7C5CFC"
          dot={false}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function BacktestPage() {
  const [assetClass, setAssetClass] = useState<'crypto' | 'stock'>('crypto')
  const [productId, setProductId]   = useState('BTCUSDT')
  const [startDate, setStartDate]   = useState('2023-01-01')
  const [endDate, setEndDate]       = useState('2024-01-01')
  const [capital, setCapital]       = useState(10000)
  const [strategyId, setStrategyId] = useState('volume-momentum-weekly')
  const [interval, setInterval] = useState('1w')

  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<BacktestApiResponse | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const hasActiveStrategies = STRATEGY_REGISTRY.length > 0

  const handleAssetClassChange = (cls: 'crypto' | 'stock') => {
    setAssetClass(cls)
    setProductId(cls === 'stock' ? 'AAPL' : 'BTCUSDT')
    setResult(null)
  }

  const isWeeklyOnlyStrategy = WEEKLY_ONLY_STRATEGY_IDS.has(strategyId)

  useEffect(() => {
    if (!isWeeklyOnlyStrategy) return
    if (interval === WEEKLY_INTERVAL) return
    setInterval(WEEKLY_INTERVAL)
  }, [interval, isWeeklyOnlyStrategy])

  const formatBacktestError = (message: string) => {
    if (message.includes('No Binance spot symbol found')) {
      return 'Symbol not found on Binance Global or Binance US spot markets. Try another ticker/pair (for example BTCUSDT or HYPEUSDT).'
    }
    if (message.includes('Binance klines API error')) {
      return 'Unable to fetch candles from Binance right now. Please try again shortly or choose another symbol.'
    }
    return message
  }

  const run = async () => {
    if (!hasActiveStrategies) {
      setError('No active strategies configured yet. Add one in code to re-enable backtesting.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const body: Record<string, unknown> = {
        assetClass,
        productId,
        interval,
        startDate,
        endDate,
        initialCapital: capital,
        strategyId,
      }

      const res  = await fetch('/api/backtest', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setResult(data as BacktestApiResponse)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      setError(formatBacktestError(message))
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'box-border h-10 w-full rounded-lg border border-[#1E1E2A] bg-[#111116] px-3 text-[14px] text-[#F0F0F8] ' +
    'focus:border-[#6B8EFF] focus:outline-none transition-colors placeholder:text-[#555568]'

  const primaryRun  = result?.runs[0] ?? null

  const overlayLabel = primaryRun?.overlays.strategy === 'score'
    ? 'Score Overlay · Strong 1.5 · Entry 1.0 · Exit 0.5'
    : 'RSI 14 · Oversold 40 · Overbought 60'
  const intervalOptions = assetClass === 'stock' ? STOCK_INTERVALS : CRYPTO_INTERVALS
  const displayedIntervalOptions = isWeeklyOnlyStrategy ? [WEEKLY_INTERVAL] : intervalOptions

  return (
    <div className="min-h-screen bg-[#0D0D0F] text-foreground px-6 py-8 max-w-7xl mx-auto">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-tight text-[#F0F0F8]">
          Strategy Backtester
        </h1>
        <p className="mt-1 text-[13px] text-[#555568]">
          Historical simulation · not financial advice
        </p>
      </div>

      {/* Asset class pill toggle */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div
          className="inline-flex rounded-lg border border-[#1E1E2A] bg-[#111116] p-[3px]"
          role="tablist"
          aria-label="Asset class"
        >
          {ASSET_CLASSES.map(ac => (
            <button
              key={ac.value}
              type="button"
              role="tab"
              aria-selected={assetClass === ac.value}
              onClick={() => handleAssetClassChange(ac.value)}
              className={`rounded-md px-4 py-2 text-[14px] font-medium transition-colors ${
                assetClass === ac.value
                  ? 'bg-[#1E1E2A] text-[#F0F0F8]'
                  : 'bg-transparent text-[#555568]'
              }`}
            >
              {ac.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main form: 2-col Coin/Interval & Start/End; full-width capital */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-6 md:gap-y-4">
        <div>
          <label className={FIELD_LABEL}>{assetClass === 'stock' ? 'Stock' : 'Coin'}</label>
          <InstrumentSelector
            assetClass={assetClass}
            value={productId}
            onChange={setProductId}
            className={inputCls}
          />
        </div>
        <div>
          <label className={FIELD_LABEL}>Interval</label>
          <select
            value={interval}
            onChange={e => setInterval(e.target.value)}
            className={inputCls}
            aria-label="Backtest interval"
            disabled={isWeeklyOnlyStrategy}
          >
            {displayedIntervalOptions.map(value => (
              <option key={value} value={value}>
                {INTERVAL_LABELS[value] ?? value}
              </option>
            ))}
          </select>
          {isWeeklyOnlyStrategy && (
            <p className="mt-1.5 text-[11px] text-[#555568]">
              This strategy only supports weekly candles
            </p>
          )}
        </div>
        <div>
          <label className={FIELD_LABEL}>Strategy</label>
          <select
            value={strategyId}
            onChange={e => setStrategyId(e.target.value)}
            className={inputCls}
            aria-label="Backtest strategy"
          >
            {STRATEGY_REGISTRY.map(strategy => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={FIELD_LABEL}>End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
        </div>
        <div className="md:col-span-2">
          <label className={FIELD_LABEL}>Starting capital ($)</label>
          <input
            type="number" value={capital} min={100}
            onChange={e => setCapital(Number(e.target.value))}
            className={inputCls}
          />
        </div>
      </div>

      {!hasActiveStrategies && (
        <div className="mb-6 rounded-xl border border-[#1E1E2A] bg-[#111116] px-6 py-5">
          <div className="text-[12px] text-[#A0A0B0]">
            No strategies are currently active. Add new strategies in `lib/strategies.ts`, then wire them in `app/api/backtest/route.ts`.
          </div>
        </div>
      )}

      {/* Action row */}
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <button
          onClick={run}
          disabled={loading || !hasActiveStrategies}
          type="button"
          className="rounded-lg border-0 bg-gradient-to-r from-[#6B8EFF] to-[#7C5CFC] px-6 py-[10px] text-[14px] font-medium text-white transition-[filter] hover:enabled:brightness-[1.06] disabled:opacity-45"
        >
          {loading ? 'Running…' : 'Run backtest'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/[0.08] border border-red-500/25 rounded-2xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && primaryRun && (
        <>
          {/* Stats */}
          <div className={`${CHART_SHELL} p-5 mb-5`}>
            <div className="mb-4 text-[11px] font-normal uppercase tracking-[0.05em] text-[#555568]">
              {`Summary · ${productId} · ${result.candleCount} candles`}
            </div>
            <StatsGrid stats={primaryRun.stats} initialCapital={capital} />
          </div>

          {/* Price chart */}
          <div className={`${CHART_SHELL} mb-5 overflow-hidden p-4`}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-normal uppercase tracking-[0.05em] text-[#555568]">
                Price chart · {productId}
              </span>
              <span className="text-[11px] text-[#555568]">
                {overlayLabel}
                {result.dataAsOf ? ` · Data as of ${new Date(result.dataAsOf).toLocaleString()}` : ''}
              </span>
            </div>
            <PriceChart
              candles={result.candles}
              trades={primaryRun.trades}
              overlays={primaryRun.overlays}
              compareTrades={undefined}
            />
          </div>

          {/* Equity curve */}
          <div className={`${CHART_SHELL} mb-5 p-4`}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-normal uppercase tracking-[0.05em] text-[#555568]">Equity curve</span>
              <div className="flex items-center gap-4 text-[11px] text-[#555568]">
                <span>
                  <span className="mr-1.5 inline-block h-0.5 w-4 align-middle bg-[#6B8EFF]" />
                  {primaryRun.label}
                </span>
                <span>
                  <span className="mr-1.5 inline-block h-0.5 w-4 align-middle border-t border-dashed border-[#7C5CFC]" />
                  Buy &amp; Hold
                </span>
              </div>
            </div>
            <EquityChart result={result} initialCapital={capital} compareMode={false} />
          </div>

          {/* Trade log */}
          {[primaryRun].map((run, ri) => (
            <div key={ri} className={`${CHART_SHELL} mb-4 p-4`}>
              <div className="mb-4 text-[11px] font-normal uppercase tracking-[0.05em] text-[#555568]">
                Trade log ({run.trades.length} entries)
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-normal uppercase tracking-[0.05em] text-[#555568]">
                      {run.overlays.strategy === 'score' ? (
                        <>
                          <th className="text-left pb-3">Entry date</th>
                          <th className="text-left pb-3">Exit date</th>
                          <th className="text-right pb-3">Entry price</th>
                          <th className="text-right pb-3">Exit price</th>
                          <th className="text-right pb-3">Entry score</th>
                          <th className="text-right pb-3">Size %</th>
                          <th className="text-right pb-3">P&L %</th>
                          <th className="text-right pb-3">Exit reason</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left pb-3">Date</th>
                          <th className="text-left pb-3">Type</th>
                          <th className="text-right pb-3">Price</th>
                          <th className="text-right pb-3">Qty</th>
                          <th className="text-right pb-3">Value</th>
                          <th className="text-right pb-3">P&L</th>
                          <th className="text-right pb-3">P&L %</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {run.overlays.strategy === 'score'
                      ? run.trades
                        .map((trade, index) => ({ trade, index }))
                        .filter(({ trade }) => trade.type === 'sell')
                        .map(({ trade, index }) => {
                          const buy = run.trades.slice(0, index).reverse().find(t => t.type === 'buy')
                          return (
                            <tr key={`${trade.time}-${index}`} className="border-t border-[#1E1E2A]">
                              <td className="py-2.5 text-[#555568]">{buy ? new Date(buy.time).toLocaleDateString() : '—'}</td>
                              <td className="py-2.5 text-[#555568]">{new Date(trade.time).toLocaleDateString()}</td>
                              <td className="py-2.5 text-right text-[#F0F0F8]">{buy ? `$${fmt(buy.price)}` : '—'}</td>
                              <td className="py-2.5 text-right text-[#F0F0F8]">${fmt(trade.price)}</td>
                              <td className="py-2.5 text-right text-[#F0F0F8]">{trade.entryScore != null ? trade.entryScore.toFixed(2) : '—'}</td>
                              <td className="py-2.5 text-right text-[#F0F0F8]">{trade.sizePct != null ? `${trade.sizePct.toFixed(0)}%` : '—'}</td>
                              <td className={`py-2.5 text-right ${trade.pnlPct != null && trade.pnlPct >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}`}>
                                {trade.pnlPct != null ? fmtPct(trade.pnlPct) : '—'}
                              </td>
                              <td className="py-2.5 text-right text-[#555568]">{trade.exitReason ?? '—'}</td>
                            </tr>
                          )
                        })
                      : run.trades.map((t, i) => (
                        <tr key={i} className="border-t border-[#1E1E2A]">
                          <td className="py-2.5 text-[#555568]">
                            {new Date(t.time).toLocaleDateString()}
                          </td>
                          <td className="py-2.5">
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              t.type === 'buy'
                                ? 'bg-[#4ADE80]/15 text-[#4ADE80]'
                                : 'bg-[#F87171]/15 text-[#F87171]'
                            }`}>
                              {t.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-[#F0F0F8]">${fmt(t.price)}</td>
                          <td className="py-2.5 text-right text-[#555568]">{t.quantity.toFixed(6)}</td>
                          <td className="py-2.5 text-right text-[#F0F0F8]">${fmt(t.value)}</td>
                          <td className={`py-2.5 text-right ${
                            t.pnl == null ? 'text-[#555568]' : t.pnl >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
                          }`}>
                            {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${fmt(t.pnl)}` : '—'}
                          </td>
                          <td className={`py-2.5 text-right ${
                            t.pnlPct == null ? 'text-[#555568]' : t.pnlPct >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
                          }`}>
                            {t.pnlPct != null ? fmtPct(t.pnlPct) : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
