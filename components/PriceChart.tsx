'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts'
import type { OverlayData, Trade } from '@/lib/types'

type CandlePoint = {
  time:   number   // ms
  open:   number
  high:   number
  low:    number
  close:  number
  volume: number
}

type TooltipState = {
  x: number
  y: number
  trade: Trade
  flip: boolean   // true → render tooltip to the left of the marker
} | null

type Props = {
  candles:       CandlePoint[]
  trades:        Trade[]
  overlays:      OverlayData
  compareTrades?: Trade[]   // second strategy markers (optional)
}

const toSec = (ms: number): Time => Math.floor(ms / 1000) as Time

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const CHART_BG = '#111116'
const CHART_GRID = '#1E1E2A'
const CHART_AXIS = '#555568'
const LINE_PRIMARY = '#6B8EFF'
const LINE_SECONDARY = '#7C5CFC'

const CHART_OPTS = {
  layout: {
    background: { type: ColorType.Solid, color: CHART_BG },
    textColor: CHART_AXIS,
    fontSize: 11,
  },
  grid: {
    vertLines: { color: CHART_GRID },
    horzLines: { color: CHART_GRID },
  },
  crosshair: { mode: 1 },
  timeScale: {
    borderColor: CHART_GRID,
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: { borderColor: CHART_GRID },
  handleScroll: true,
  handleScale: true,
}

export default function PriceChart({ candles, trades, overlays, compareTrades }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  // Keep stable ref to avoid tooltip state triggering re-render of chart effect
  const tooltipRef = useRef<TooltipState>(null)
  const setTooltipStable = useCallback((t: TooltipState) => {
    tooltipRef.current = t
    setTooltip(t)
  }, [])

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    chartRef.current?.remove()
    chartRef.current = null
    candleRef.current = null

    const chart = createChart(containerRef.current, {
      ...CHART_OPTS,
      width:  containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    })
    chartRef.current = chart

    // ── Pane 0: Candlestick series ──────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
    })

    candleSeries.setData(
      candles.map(c => ({
        time:  toSec(c.time),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
      })),
    )
    candleRef.current = candleSeries

    // ── Pane 0: Volume histogram (bottom 20% of price pane) ────────────
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(107, 142, 255, 0.12)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })
    volumeSeries.setData(
      candles.map(c => ({
        time:  toSec(c.time),
        value: c.volume,
        color: c.close >= c.open
          ? 'rgba(74, 222, 128, 0.18)'
          : 'rgba(248, 113, 113, 0.18)',
      })),
    )

    // ── Pane 0: EMA overlays (golden-cross strategy) ───────────────────
    if (overlays.strategy === 'golden-cross') {
      const fastLine = chart.addSeries(LineSeries, {
        color: LINE_PRIMARY,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'Fast EMA',
      })
      fastLine.setData(overlays.fastEma.map(p => ({ time: toSec(p.time), value: p.value })))

      const slowLine = chart.addSeries(LineSeries, {
        color: LINE_SECONDARY,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'Slow EMA',
      })
      slowLine.setData(overlays.slowEma.map(p => ({ time: toSec(p.time), value: p.value })))
    }

    // ── Build trade lookup maps for tooltip ────────────────────────────
    // Primary trades keyed by UTC seconds
    const primaryMap = new Map<number, Trade>()
    for (const t of trades) primaryMap.set(Math.floor(t.time / 1000), t)

    const compareMap = new Map<number, Trade>()
    if (compareTrades) {
      for (const t of compareTrades) compareMap.set(Math.floor(t.time / 1000), t)
    }

    // ── Primary strategy buy/sell markers ──────────────────────────────
    if (trades.length > 0) {
      const sorted = [...trades].sort((a, b) => a.time - b.time)
      const markers: SeriesMarker<Time>[] = sorted.map(t => ({
        time:     toSec(t.time),
        position: (t.type === 'buy' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        color:    t.type === 'buy' ? '#4ADE80' : '#F87171',
        shape:    (t.type === 'buy' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text:     t.type === 'buy' ? 'B' : 'S',
        size:     1,
      }))
      createSeriesMarkers(candleSeries, markers)
    }

    // ── Comparison strategy markers (different palette) ────────────────
    if (compareTrades && compareTrades.length > 0) {
      // Render on a transparent line series so markers appear without cluttering candles
      const ghostSeries = chart.addSeries(LineSeries, {
        color: 'transparent',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      ghostSeries.setData(
        candles.map(c => ({ time: toSec(c.time), value: c.close })),
      )
      const cmpSorted = [...compareTrades].sort((a, b) => a.time - b.time)
      const cmpMarkers: SeriesMarker<Time>[] = cmpSorted.map(t => ({
        time:     toSec(t.time),
        position: (t.type === 'buy' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        color:    t.type === 'buy' ? LINE_SECONDARY : LINE_PRIMARY,
        shape:    (t.type === 'buy' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text:     t.type === 'buy' ? 'B2' : 'S2',
        size:     1,
      }))
      createSeriesMarkers(ghostSeries, cmpMarkers)
    }

    // ── Pane 1: RSI ─────────────────────────────────────────────────────
    if (overlays.strategy === 'rsi' && overlays.rsi.length > 0) {
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: LINE_PRIMARY,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'RSI',
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 },
            margins: { above: 0.1, below: 0.1 },
          }),
        },
        1,
      )
      rsiSeries.setData(overlays.rsi.map(p => ({ time: toSec(p.time), value: p.value })))

      rsiSeries.createPriceLine({
        price: overlays.oversold,
        color: 'rgba(239, 83, 80, 0.45)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: String(overlays.oversold),
      })
      rsiSeries.createPriceLine({
        price: overlays.overbought,
        color: 'rgba(38, 166, 154, 0.45)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: true,
        title: String(overlays.overbought),
      })
      rsiSeries.createPriceLine({
        price: 50,
        color: 'rgba(85, 85, 104, 0.45)',
        lineStyle: LineStyle.Dashed,
        lineWidth: 1,
        axisLabelVisible: false,
        title: '',
      })

      const panes = chart.panes()
      if (panes[0]) panes[0].setHeight(300)
      if (panes[1]) panes[1].setHeight(130)
    }

    // ── Pane 1: MACD ────────────────────────────────────────────────────
    if (overlays.strategy === 'macd' && overlays.macdLine.length > 0) {
      const histSeries = chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false, title: '' },
        1,
      )
      histSeries.setData(
        overlays.histogram.map(p => ({
          time:  toSec(p.time),
          value: p.value,
          color: p.value >= 0 ? 'rgba(74, 222, 128, 0.45)' : 'rgba(248, 113, 113, 0.45)',
        })),
      )

      const macdLine = chart.addSeries(
        LineSeries,
        { color: LINE_PRIMARY, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'MACD' },
        1,
      )
      macdLine.setData(overlays.macdLine.map(p => ({ time: toSec(p.time), value: p.value })))

      const signalLine = chart.addSeries(
        LineSeries,
        { color: LINE_SECONDARY, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: 'Signal' },
        1,
      )
      signalLine.setData(overlays.signalLine.map(p => ({ time: toSec(p.time), value: p.value })))

      const panes = chart.panes()
      if (panes[0]) panes[0].setHeight(300)
      if (panes[1]) panes[1].setHeight(140)
    }

    chart.timeScale().fitContent()

    // ── Interactive trade tooltip via crosshair subscription ───────────
    chart.subscribeCrosshairMove(param => {
      if (!param.time || !containerRef.current) {
        setTooltipStable(null)
        return
      }

      const timeSec = param.time as number

      // Check primary or compare trades at this timestamp
      const trade = primaryMap.get(timeSec) ?? compareMap.get(timeSec) ?? null
      if (!trade) {
        setTooltipStable(null)
        return
      }

      const x = chart.timeScale().timeToCoordinate(param.time)
      const y = candleSeries.priceToCoordinate(trade.price)
      if (x === null || y === null) {
        setTooltipStable(null)
        return
      }

      const containerWidth = containerRef.current.offsetWidth
      setTooltipStable({
        x,
        y,
        trade,
        flip: x > containerWidth - 200,
      })
    })

    // ── Resize observer ─────────────────────────────────────────────────
    const observer = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.resize(
          containerRef.current.offsetWidth,
          containerRef.current.offsetHeight,
        )
      }
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
      chartRef.current  = null
      candleRef.current = null
    }
  }, [candles, trades, overlays, compareTrades, setTooltipStable])

  const hasIndicatorPane = overlays.strategy === 'rsi' || overlays.strategy === 'macd'

  return (
    <div className="relative w-full" style={{ height: hasIndicatorPane ? 460 : 340 }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Trade tooltip */}
      {tooltip && (
        <div
          style={{
            position:      'absolute',
            left:          tooltip.flip ? tooltip.x - 175 : tooltip.x + 14,
            top:           Math.max(4, tooltip.y - 80),
            pointerEvents: 'none',
            zIndex:        20,
          }}
          className="min-w-[155px] rounded-xl border border-[#1E1E2A] bg-[#111116] px-3 py-2.5 text-xs"
        >
          <div className={`mb-1.5 text-sm font-semibold ${
            tooltip.trade.type === 'buy' ? 'text-[#4ADE80]' : 'text-[#F87171]'
          }`}>
            {tooltip.trade.type === 'buy' ? '▲ BUY' : '▼ SELL'}
          </div>
          <div className="flex justify-between gap-3 text-[#555568]">
            <span>Price</span>
            <span className="text-[#F0F0F8]">${fmt(tooltip.trade.price)}</span>
          </div>
          <div className="flex justify-between gap-3 text-[#555568]">
            <span>Qty</span>
            <span className="text-[#F0F0F8]">{tooltip.trade.quantity.toFixed(4)}</span>
          </div>
          <div className="flex justify-between gap-3 text-[#555568]">
            <span>Value</span>
            <span className="text-[#F0F0F8]">${fmt(tooltip.trade.value)}</span>
          </div>
          {tooltip.trade.pnl != null && (
            <div className={`mt-1 flex justify-between gap-3 border-t border-[#1E1E2A] pt-1 font-medium ${
              tooltip.trade.pnl >= 0 ? 'text-[#4ADE80]' : 'text-[#F87171]'
            }`}>
              <span>P&L</span>
              <span>{tooltip.trade.pnl >= 0 ? '+' : ''}${fmt(tooltip.trade.pnl)}</span>
            </div>
          )}
          {tooltip.trade.pnlPct != null && (
            <div className={`flex justify-between gap-3 ${
              tooltip.trade.pnlPct >= 0 ? 'text-[#4ADE80]/90' : 'text-[#F87171]/90'
            }`}>
              <span></span>
              <span className="text-xs">
                {tooltip.trade.pnlPct >= 0 ? '+' : ''}{tooltip.trade.pnlPct.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="mt-1.5 border-t border-[#1E1E2A] pt-1 text-[11px] text-[#555568]">
            {new Date(tooltip.trade.time).toLocaleString([], {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
        </div>
      )}

      {/* Marker legend when comparison is active */}
      {compareTrades && compareTrades.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 flex gap-3 text-[11px] text-[#555568]">
          <span><span className="text-[#4ADE80]">▲</span><span className="text-[#F87171]">▼</span> Strategy 1</span>
          <span><span className="text-[#6B8EFF]">▲</span><span className="text-[#7C5CFC]">▼</span> Strategy 2</span>
        </div>
      )}
    </div>
  )
}
