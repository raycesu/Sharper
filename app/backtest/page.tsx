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
import { STRATEGY_REGISTRY } from '@/lib/strategies'

const PriceChart = dynamic(() => import('@/components/PriceChart'), { ssr: false })
const WEEKLY_INTERVAL = '1w'
const ASSET_CLASSES = [
  { label: 'Crypto', value: 'crypto' as const },
  { label: 'Stocks', value: 'stock'  as const },
]

const FIELD_LABEL =
  'mb-2 block text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B8499]'

/** Results / charts (after backtest) - hex literals inlined for Tailwind */
const RESULT_CARD =
  'relative overflow-visible rounded-[8px] border border-[#242B3B] bg-[#10141D] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]'
const PANEL_SHELL =
  'rounded-[8px] border border-[#242B3B] bg-[#0D111A]/95 shadow-[0_18px_70px_rgba(0,0,0,0.28)]'
const CHART_SHELL = `${PANEL_SHELL} overflow-hidden`

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
    <span className="group/hint relative ml-1.5 inline-flex items-center cursor-help">
      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#30394D] bg-[#151B28] text-[10px] leading-none text-[#7B8499] transition-colors group-hover/hint:border-[#6B8EFF]/55 group-hover/hint:text-[#9FB2FF]">
        ⓘ
      </span>
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute z-50',
          'top-full left-1/2 -translate-x-1/2 mt-2',
          'w-64 px-3 py-2.5 rounded-[8px] text-[11px] leading-relaxed',
          'normal-case tracking-normal font-normal',
          'bg-[#151B28] border border-[#30394D] text-[#B7C0D4] shadow-[0_18px_40px_rgba(0,0,0,0.38)]',
          'opacity-0 group-hover/hint:opacity-100 transition-opacity duration-150',
        ].join(' ')}
      >
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-[-1px] border-[5px] border-transparent border-b-[#151B28]" />
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
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[2px] bg-gradient-to-r from-[#6B8EFF] via-[#7C5CFC] to-transparent"
      />
      <div className="relative">
        <div className="mb-2 flex items-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B8499]">
          <span>{label}</span>
          {hint && <MetricHint text={hint} />}
        </div>
        <div className={`text-[26px] font-semibold leading-tight tracking-tight ${color ?? 'text-[#F4F7FC]'}`}>
          {value}
        </div>
        {sub && <div className="mt-2 text-[12px] font-medium text-[#7B8499]">{sub}</div>}
      </div>
    </div>
  )
}

function StatsGrid({ stats, initialCapital }: { stats: BacktestStats; initialCapital: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard
        label="Total return"
        value={fmtPct(stats.totalReturn)}
        sub={`${stats.totalReturnAbs >= 0 ? '+' : ''}$${fmt(stats.totalReturnAbs)}`}
        color={stats.totalReturn >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'}
      />
      <StatCard label="Win rate"     value={`${fmt(stats.winRate)}%`}             sub={`${stats.totalTrades} trades`} />
      <StatCard label="Max drawdown" value={`${fmt(stats.maxDrawdown)}%`}         color="text-[#FB7185]" />
      <StatCard label="Sharpe ratio"  value={fmt(stats.sharpeRatio)}  sub="annualised" hint={METRIC_HINTS.sharpe} />
      <StatCard label="Sortino ratio" value={fmt(stats.sortinoRatio)} sub="annualised" hint={METRIC_HINTS.sortino} />
      <StatCard label="Best trade"   value={fmtPct(stats.bestTrade)}              color="text-[#4ADE80]" />
      <StatCard label="Worst trade"  value={fmtPct(stats.worstTrade)}             color="text-[#FB7185]" />
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B8499]">
            <th className="text-left pb-3 pr-4 font-semibold">Metric</th>
            <th className="text-right pb-3 pr-4 font-semibold">
              <span style={{ color: RUN_COLORS[0] }}>{a.label}</span>
            </th>
            <th className="text-right pb-3 font-semibold">
              <span style={{ color: RUN_COLORS[1] }}>{b.label}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-t border-[#242B3B]">
              <td className="py-3 pr-4">
                <span className="text-[#8F99AF]">{row.label}</span>
                {row.hint && <MetricHint text={row.hint} />}
              </td>
              <td className={`py-3 text-right pr-4 text-[15px] font-semibold ${row.aColor ?? 'text-[#F4F7FC]'}`}>{row.aVal}</td>
              <td className={`py-3 text-right text-[15px] font-semibold ${row.bColor ?? 'text-[#F4F7FC]'}`}>{row.bVal}</td>
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
    const primary = result.runs[0].equityCurve
    const secondary = result.runs[1]?.equityCurve
    const bench = result.benchmarkCurve
    const secondaryByTime = new Map((secondary ?? []).map(p => [p.time, p.value]))
    const benchmarkByTime = new Map(bench.map(p => [p.time, p.value]))

    let lastSecondary: number | undefined = compareMode ? initialCapital : undefined
    let lastBenchmark = benchmarkByTime.get(primary[0]?.time) ?? initialCapital

    return primary.map(p => {
      if (secondaryByTime.has(p.time)) lastSecondary = secondaryByTime.get(p.time)!
      if (benchmarkByTime.has(p.time)) lastBenchmark = benchmarkByTime.get(p.time)!
      return {
        time:      p.time,
        primary:   p.value,
        secondary: compareMode ? lastSecondary : undefined,
        benchmark: lastBenchmark,
      }
    })
  }, [result, initialCapital, compareMode])

  const tickFmt = (v: number) => `$${(v / 1000).toFixed(0)}k`

  const tooltipStyle = {
    background:   '#151B28',
    border:       '1px solid #30394D',
    borderRadius: 8,
    color:          '#B7C0D4',
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#242B3B" />
        <XAxis dataKey="time" hide />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: '#7B8499', fontSize: 11 }}
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
          wrapperStyle={{ fontSize: 11, color: '#7B8499' }}
        />
        <ReferenceLine y={initialCapital} stroke="#30394D" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="primary" stroke="#6B8EFF" dot={false} strokeWidth={1.5} />
        {compareMode && (
          <Line type="monotone" dataKey="secondary" stroke="#7C5CFC" dot={false} strokeWidth={1.5} />
        )}
        <Line
          type="monotone"
          dataKey="benchmark"
          stroke={compareMode ? '#9CA3AF' : '#7C5CFC'}
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
  const [compareStrategyId, setCompareStrategyId] = useState('')

  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<BacktestApiResponse | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const hasActiveStrategies = STRATEGY_REGISTRY.length > 0

  const handleAssetClassChange = (cls: 'crypto' | 'stock') => {
    setAssetClass(cls)
    setProductId(cls === 'stock' ? 'AAPL' : 'BTCUSDT')
    setResult(null)
  }

  useEffect(() => {
    if (compareStrategyId !== '' && compareStrategyId === strategyId) {
      setCompareStrategyId('')
    }
  }, [strategyId, compareStrategyId])

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
        interval: WEEKLY_INTERVAL,
        startDate,
        endDate,
        initialCapital: capital,
        strategyId,
      }
      if (compareStrategyId !== '' && compareStrategyId !== strategyId) {
        body.compareStrategyId = compareStrategyId
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
    'box-border h-12 w-full rounded-[8px] border border-[#283045] bg-[#111722] px-3.5 text-[14px] font-medium text-[#F4F7FC] ' +
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition-colors placeholder:text-[#667189] focus:border-[#6B8EFF] focus:outline-none focus:ring-2 focus:ring-[#6B8EFF]/15'

  const primaryRun = result?.runs[0] ?? null
  const secondaryRun = result?.runs[1] ?? null
  const hasCompare = Boolean(result && result.runs.length > 1 && secondaryRun)

  const overlayLabel = primaryRun?.overlays.strategy === 'score'
    ? 'Score Overlay · Strong 1.5 · Entry 1.0 · Exit −0.5'
    : 'RSI 14 · Oversold 40 · Overbought 60'

  return (
    <div className="min-h-screen bg-[#070A0F] text-[#A9B0C2]">
      <div className="mx-auto w-full max-w-[1240px] px-5 pb-12 pt-32 sm:px-6 lg:px-8 lg:pt-36">

        {/* Page header */}
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-[#283045] bg-[#111722] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8EA2FF]">
              Backtester
            </div>
            <h1 className="text-[32px] font-semibold tracking-tight text-[#F4F7FC] sm:text-[40px]">
              Strategy Backtester
            </h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-6 text-[#7B8499]">
              Historical simulation for weekly crypto and equity strategies.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 rounded-[8px] border border-[#242B3B] bg-[#0D111A] p-3 sm:w-auto sm:min-w-[250px]">
            <div className="flex items-center justify-between gap-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B8499]">
              <span>Timeframe</span>
              <span className="text-[#F4F7FC]">1 week</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1A2130]">
              <div className="h-full w-full bg-gradient-to-r from-[#6B8EFF] to-[#7C5CFC]" />
            </div>
          </div>
        </div>

        <section className={`${PANEL_SHELL} mb-6 p-4 sm:p-5`}>
          <div className="mb-5 flex flex-col gap-4 border-b border-[#242B3B] pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-[18px] font-semibold tracking-tight text-[#F4F7FC]">Backtest setup</h2>
              <p className="mt-1 text-[13px] text-[#7B8499]">Configure the market, strategy, and simulation range.</p>
            </div>
            <div
              className="inline-flex w-fit rounded-[8px] border border-[#283045] bg-[#090D14] p-1"
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
                  className={`min-h-9 rounded-[6px] px-4 text-[14px] font-semibold transition-colors ${
                    assetClass === ac.value
                      ? 'bg-[#20283A] text-[#F4F7FC] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                      : 'bg-transparent text-[#7B8499] hover:text-[#D8DEF0]'
                  }`}
                >
                  {ac.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              <label className={FIELD_LABEL}>Timeframe</label>
              <div
                className="flex h-12 w-full items-center justify-between rounded-[8px] border border-[#283045] bg-[#111722] px-3.5 text-[14px] font-semibold text-[#F4F7FC] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]"
                aria-label="Backtest timeframe"
              >
                <span>1 week</span>
                <span className="rounded-full border border-[#30394D] bg-[#151B28] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8EA2FF]">
                  Fixed
                </span>
              </div>
            </div>
            <div className="xl:col-span-2">
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
            <div className="md:col-span-2">
              <label className={FIELD_LABEL}>Compare with</label>
              <select
                value={compareStrategyId}
                onChange={e => setCompareStrategyId(e.target.value)}
                className={inputCls}
                aria-label="Optional second strategy to compare on the same symbol and range"
              >
                <option value="">None</option>
                {STRATEGY_REGISTRY.map(strategy => (
                  <option key={strategy.id} value={strategy.id} disabled={strategy.id === strategyId}>
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
            <div className="md:col-span-2 xl:col-span-3">
              <label className={FIELD_LABEL}>Starting capital ($)</label>
              <input
                type="number" value={capital} min={100}
                onChange={e => setCapital(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={run}
                disabled={loading || !hasActiveStrategies}
                type="button"
                className="inline-flex h-12 w-full items-center justify-center rounded-[8px] border border-[#7C5CFC]/20 bg-gradient-to-r from-[#6B8EFF] to-[#7C5CFC] px-5 text-[14px] font-semibold text-white shadow-[0_14px_36px_rgba(107,142,255,0.24)] transition-[filter,transform,opacity] hover:enabled:-translate-y-0.5 hover:enabled:brightness-[1.06] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loading ? 'Running...' : 'Run backtest'}
              </button>
            </div>
          </div>
        </section>

      {!hasActiveStrategies && (
        <div className="mb-6 rounded-[8px] border border-[#30394D] bg-[#111722] px-5 py-4">
          <div className="text-[13px] text-[#B7C0D4]">
            No strategies are currently active. Add new strategies in `lib/strategies.ts`, then wire them in `app/api/backtest/route.ts`.
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-[8px] border border-[#FB7185]/30 bg-[#FB7185]/10 p-4 text-sm font-medium text-[#FDA4AF]">
          {error}
        </div>
      )}

      {result && primaryRun && (
        <>
          {/* Stats */}
          <div className={`${CHART_SHELL} mb-5 p-5`}>
            <div className="mb-5 flex flex-col gap-2 border-b border-[#242B3B] pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8EA2FF]">
                  Summary
                </div>
                <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-[#F4F7FC]">
                  {productId}
                </h2>
              </div>
              <div className="text-[12px] font-medium text-[#7B8499]">
                {result.candleCount} candles · 1 week
              </div>
            </div>
            {hasCompare && secondaryRun ? (
              <CompareStats runs={[primaryRun, secondaryRun]} initialCapital={capital} />
            ) : (
              <StatsGrid stats={primaryRun.stats} initialCapital={capital} />
            )}
          </div>

          {/* Price chart */}
          <div className={`${CHART_SHELL} mb-5 overflow-hidden p-4`}>
            <div className="mb-4 flex flex-col gap-2 border-b border-[#242B3B] pb-4 lg:flex-row lg:items-center lg:justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8EA2FF]">
                Price chart · {productId}
              </span>
              <span className="text-[12px] font-medium text-[#7B8499]">
                {overlayLabel}
                {result.dataAsOf ? ` · Data as of ${new Date(result.dataAsOf).toLocaleString()}` : ''}
              </span>
            </div>
            <PriceChart
              candles={result.candles}
              trades={primaryRun.trades}
              overlays={primaryRun.overlays}
              compareTrades={hasCompare && secondaryRun ? secondaryRun.trades : undefined}
            />
          </div>

          {/* Equity curve */}
          <div className={`${CHART_SHELL} mb-5 p-4`}>
            <div className="mb-4 flex flex-col gap-2 border-b border-[#242B3B] pb-4 lg:flex-row lg:items-center lg:justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8EA2FF]">Equity curve</span>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-[#7B8499]">
                <span>
                  <span className="mr-1.5 inline-block h-0.5 w-4 align-middle bg-[#6B8EFF]" />
                  {primaryRun.label}
                </span>
                {hasCompare && secondaryRun && (
                  <span>
                    <span className="mr-1.5 inline-block h-0.5 w-4 align-middle bg-[#7C5CFC]" />
                    {secondaryRun.label}
                  </span>
                )}
                <span>
                  <span className="mr-1.5 inline-block h-0.5 w-4 align-middle border-t border-dashed border-[#9CA3AF]" />
                  Buy &amp; Hold
                </span>
              </div>
            </div>
            <EquityChart result={result} initialCapital={capital} compareMode={Boolean(hasCompare)} />
          </div>

          {/* Trade log */}
          {(hasCompare ? result.runs : [primaryRun]).map((run, ri) => (
            <div key={`${run.label}-${ri}`} className={`${CHART_SHELL} mb-4 p-4`}>
              <div className="mb-4 flex flex-col gap-1 border-b border-[#242B3B] pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8EA2FF]">Trade log</div>
                  <h2 className="mt-1 text-[18px] font-semibold tracking-tight text-[#F4F7FC]">{run.label}</h2>
                </div>
                <div className="text-[12px] font-medium text-[#7B8499]">{run.trades.length} entries</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7B8499]">
                      {run.overlays.strategy === 'score' ? (
                        <>
                          <th className="text-left pb-3 font-semibold">Entry date</th>
                          <th className="text-left pb-3 font-semibold">Exit date</th>
                          <th className="text-right pb-3 font-semibold">Entry price</th>
                          <th className="text-right pb-3 font-semibold">Exit price</th>
                          <th className="text-right pb-3 font-semibold">Entry score</th>
                          <th className="text-right pb-3 font-semibold">Size %</th>
                          <th className="text-right pb-3 font-semibold">P&L %</th>
                          <th className="text-right pb-3 font-semibold">Exit reason</th>
                        </>
                      ) : (
                        <>
                          <th className="text-left pb-3 font-semibold">Date</th>
                          <th className="text-left pb-3 font-semibold">Type</th>
                          <th className="text-right pb-3 font-semibold">Price</th>
                          <th className="text-right pb-3 font-semibold">Qty</th>
                          <th className="text-right pb-3 font-semibold">Value</th>
                          <th className="text-right pb-3 font-semibold">P&L</th>
                          <th className="text-right pb-3 font-semibold">P&L %</th>
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
                            <tr key={`${trade.time}-${index}`} className="border-t border-[#242B3B]">
                              <td className="py-3 text-[#8F99AF]">{buy ? new Date(buy.time).toLocaleDateString() : '—'}</td>
                              <td className="py-3 text-[#8F99AF]">{new Date(trade.time).toLocaleDateString()}</td>
                              <td className="py-3 text-right font-medium text-[#F4F7FC]">{buy ? `$${fmt(buy.price)}` : '—'}</td>
                              <td className="py-3 text-right font-medium text-[#F4F7FC]">${fmt(trade.price)}</td>
                              <td className="py-3 text-right font-medium text-[#F4F7FC]">{trade.entryScore != null ? trade.entryScore.toFixed(2) : '—'}</td>
                              <td className="py-3 text-right font-medium text-[#F4F7FC]">{trade.sizePct != null ? `${trade.sizePct.toFixed(0)}%` : '—'}</td>
                              <td className={`py-3 text-right font-semibold ${trade.pnlPct != null && trade.pnlPct >= 0 ? 'text-[#4ADE80]' : 'text-[#FB7185]'}`}>
                                {trade.pnlPct != null ? fmtPct(trade.pnlPct) : '—'}
                              </td>
                              <td className="py-3 text-right text-[#8F99AF]">{trade.exitReason ?? '—'}</td>
                            </tr>
                          )
                        })
                      : run.trades.map((t, i) => (
                        <tr key={i} className="border-t border-[#242B3B]">
                          <td className="py-3 text-[#8F99AF]">
                            {new Date(t.time).toLocaleDateString()}
                          </td>
                          <td className="py-3">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              t.type === 'buy'
                                ? 'bg-[#4ADE80]/15 text-[#4ADE80]'
                                : 'bg-[#FB7185]/15 text-[#FB7185]'
                            }`}>
                              {t.type.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium text-[#F4F7FC]">${fmt(t.price)}</td>
                          <td className="py-3 text-right text-[#8F99AF]">{t.quantity.toFixed(6)}</td>
                          <td className="py-3 text-right font-medium text-[#F4F7FC]">${fmt(t.value)}</td>
                          <td className={`py-3 text-right font-semibold ${
                            t.pnl == null ? 'text-[#8F99AF]' : t.pnl >= 0 ? 'text-[#4ADE80]' : 'text-[#FB7185]'
                          }`}>
                            {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${fmt(t.pnl)}` : '—'}
                          </td>
                          <td className={`py-3 text-right font-semibold ${
                            t.pnlPct == null ? 'text-[#8F99AF]' : t.pnlPct >= 0 ? 'text-[#4ADE80]' : 'text-[#FB7185]'
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
    </div>
  )
}
