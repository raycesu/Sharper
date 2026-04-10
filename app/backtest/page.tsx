'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import CoinSelector from '@/components/CoinSelector'
import type { OverlayData } from '@/lib/types'
import type { Candle } from '@/lib/coinbase'

// PriceChart uses the DOM directly — load client-only to skip SSR
const PriceChart = dynamic(() => import('@/components/PriceChart'), { ssr: false })

type Trade = {
  type: 'buy' | 'sell'
  price: number
  quantity: number
  time: number
  value: number
  pnl?: number
  pnlPct?: number
}

type BacktestResult = {
  trades: Trade[]
  equityCurve: { time: number; value: number }[]
  stats: {
    totalReturn: number
    totalReturnAbs: number
    winRate: number
    totalTrades: number
    maxDrawdown: number
    sharpeRatio: number
    bestTrade: number
    worstTrade: number
  }
  candleCount: number
  candles: Candle[]
  overlays: OverlayData
}

const INTERVALS = [
  { label: '1 hour',  value: '1h' },
  { label: '4 hours', value: '4h' },
  { label: '1 day',   value: '1d' },
]

const STRATEGIES = [
  { label: 'RSI oversold / overbought', value: 'rsi' },
  { label: 'Golden cross (EMA)',         value: 'golden-cross' },
  { label: 'MACD signal cross',          value: 'macd' },
]

export default function BacktestPage() {
  const [productId, setProductId] = useState('BTC-USD')
  const [interval, setInterval]   = useState('1d')
  const [startDate, setStartDate] = useState('2023-01-01')
  const [endDate, setEndDate]     = useState('2024-01-01')
  const [strategy, setStrategy]   = useState('rsi')
  const [capital, setCapital]     = useState(10000)
  const [rsiOversold, setRsiOversold]     = useState(30)
  const [rsiOverbought, setRsiOverbought] = useState(70)
  const [fastPeriod, setFastPeriod] = useState(50)
  const [slowPeriod, setSlowPeriod] = useState(200)

  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<BacktestResult | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          interval,
          startDate,
          endDate,
          strategy,
          initialCapital: capital,
          rsiOversold,
          rsiOverbought,
          fastPeriod,
          slowPeriod,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Unknown error')
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fmt    = (n: number) =>
    new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}%`

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a89cf7]/60'

  const overlayLabel =
    result?.overlays.strategy === 'golden-cross'
      ? `Fast EMA: purple  ·  Slow EMA: yellow`
      : result?.overlays.strategy === 'rsi'
        ? `RSI (14)  ·  Purple line  ·  Red dashed = oversold  ·  Green dashed = overbought`
        : result?.overlays.strategy === 'macd'
          ? `MACD: purple  ·  Signal: yellow  ·  Histogram: green/red`
          : ''

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white p-6 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold text-[#a89cf7] mb-1">Strategy Backtester</h1>
      <p className="text-xs text-white/30 mb-6">Historical simulation · not financial advice</p>

      {/* Config panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label className="block text-xs text-white/40 mb-1">Coin</label>
          <CoinSelector value={productId} onChange={setProductId} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">Interval</label>
          <select value={interval} onChange={e => setInterval(e.target.value)} className={inputCls}>
            {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">Start date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">End date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">Strategy</label>
          <select value={strategy} onChange={e => setStrategy(e.target.value)} className={inputCls}>
            {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/40 mb-1">Starting capital ($)</label>
          <input
            type="number" value={capital} min={100}
            onChange={e => setCapital(Number(e.target.value))}
            className={inputCls}
          />
        </div>

        {strategy === 'rsi' && <>
          <div>
            <label className="block text-xs text-white/40 mb-1">RSI oversold</label>
            <input type="number" value={rsiOversold} min={1} max={49}
              onChange={e => setRsiOversold(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">RSI overbought</label>
            <input type="number" value={rsiOverbought} min={51} max={99}
              onChange={e => setRsiOverbought(Number(e.target.value))} className={inputCls} />
          </div>
        </>}

        {strategy === 'golden-cross' && <>
          <div>
            <label className="block text-xs text-white/40 mb-1">Fast EMA period</label>
            <input type="number" value={fastPeriod} min={2}
              onChange={e => setFastPeriod(Number(e.target.value))} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-white/40 mb-1">Slow EMA period</label>
            <input type="number" value={slowPeriod} min={3}
              onChange={e => setSlowPeriod(Number(e.target.value))} className={inputCls} />
          </div>
        </>}
      </div>

      <button
        onClick={run}
        disabled={loading}
        className="mb-8 px-6 py-2.5 bg-[#a89cf7] hover:bg-[#baaff9] text-[#1a1630] font-semibold rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Running backtest…' : 'Run backtest'}
      </button>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              {
                label: 'Total return',
                value: fmtPct(result.stats.totalReturn),
                color: result.stats.totalReturn >= 0 ? 'text-green-400' : 'text-red-400',
              },
              {
                label: 'Abs. P&L',
                value: `${result.stats.totalReturnAbs >= 0 ? '+' : ''}$${fmt(result.stats.totalReturnAbs)}`,
                color: result.stats.totalReturnAbs >= 0 ? 'text-green-400' : 'text-red-400',
              },
              { label: 'Win rate',     value: `${fmt(result.stats.winRate)}%`,      color: '' },
              { label: 'Total trades', value: result.stats.totalTrades.toString(),  color: '' },
              { label: 'Max drawdown', value: `${fmt(result.stats.maxDrawdown)}%`,  color: 'text-red-400' },
              { label: 'Sharpe ratio', value: fmt(result.stats.sharpeRatio),        color: '' },
              { label: 'Best trade',   value: fmtPct(result.stats.bestTrade),       color: 'text-green-400' },
              { label: 'Worst trade',  value: fmtPct(result.stats.worstTrade),      color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
                <div className="text-xs text-white/35 mb-1">{s.label}</div>
                <div className={`text-lg font-semibold ${s.color || 'text-white'}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Price chart — candlesticks + indicator overlays + buy/sell markers */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 mb-6 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/35 uppercase tracking-wider">
                Price chart · {productId}
              </span>
              <span className="text-xs text-white/20">{overlayLabel}</span>
            </div>
            <PriceChart
              candles={result.candles}
              trades={result.trades}
              overlays={result.overlays}
            />
          </div>

          {/* Equity curve */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-white/35 uppercase tracking-wider">Equity curve</span>
              <span className="text-xs text-white/25">{result.candleCount} candles</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={result.equityCurve}>
                <XAxis dataKey="time" hide />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                  width={70}
                  tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: '#1a1630',
                    border: '0.5px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                  }}
                  formatter={(v: unknown) => [`$${fmt(v as number)}`, 'Portfolio']}
                  labelFormatter={t => new Date(t as number).toLocaleDateString()}
                />
                <ReferenceLine y={capital} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="value" stroke="#a89cf7" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Trade log */}
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
            <div className="text-xs text-white/35 uppercase tracking-wider mb-4">
              Trade log ({result.trades.length} entries)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-white/25 uppercase tracking-wider">
                    <th className="text-left pb-3">Date</th>
                    <th className="text-left pb-3">Type</th>
                    <th className="text-right pb-3">Price</th>
                    <th className="text-right pb-3">Qty</th>
                    <th className="text-right pb-3">Value</th>
                    <th className="text-right pb-3">P&L</th>
                    <th className="text-right pb-3">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} className="border-t border-white/[0.05]">
                      <td className="py-2.5 text-white/50">
                        {new Date(t.time).toLocaleDateString()}
                      </td>
                      <td className="py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          t.type === 'buy'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-red-500/10 text-red-400'
                        }`}>
                          {t.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-white/70">${fmt(t.price)}</td>
                      <td className="py-2.5 text-right text-white/50">{t.quantity.toFixed(6)}</td>
                      <td className="py-2.5 text-right text-white/70">${fmt(t.value)}</td>
                      <td className={`py-2.5 text-right ${
                        t.pnl == null ? 'text-white/30' : t.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${fmt(t.pnl)}` : '—'}
                      </td>
                      <td className={`py-2.5 text-right ${
                        t.pnlPct == null ? 'text-white/30' : t.pnlPct >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {t.pnlPct != null ? fmtPct(t.pnlPct) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
