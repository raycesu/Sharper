'use client'

import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  type IChartApi,
  type Time,
  type SeriesMarker,
} from 'lightweight-charts'
import type { OverlayData } from '@/lib/types'

type CandlePoint = {
  time: number  // ms
  open: number
  high: number
  low: number
  close: number
}

type TradeMarker = {
  type: 'buy' | 'sell'
  time: number  // ms
  price: number
}

type Props = {
  candles: CandlePoint[]
  trades: TradeMarker[]
  overlays: OverlayData
}

// LW Charts uses UTC seconds, not ms
const toSec = (ms: number): Time => Math.floor(ms / 1000) as Time

const CHART_OPTS = {
  layout: {
    background: { type: ColorType.Solid, color: '#0d0d14' },
    textColor: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
  },
  crosshair: { mode: 1 },
  timeScale: {
    borderColor: 'rgba(255, 255, 255, 0.08)',
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: { borderColor: 'rgba(255, 255, 255, 0.08)' },
  handleScroll: true,
  handleScale: true,
}

export default function PriceChart({ candles, trades, overlays }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return

    // Destroy previous chart before creating a new one
    chartRef.current?.remove()
    chartRef.current = null

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

    // ── Pane 0: EMA overlays (golden-cross strategy) ───────────────────
    if (overlays.strategy === 'golden-cross') {
      const fastLine = chart.addSeries(LineSeries, {
        color: '#a89cf7',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'Fast EMA',
      })
      fastLine.setData(overlays.fastEma.map(p => ({ time: toSec(p.time), value: p.value })))

      const slowLine = chart.addSeries(LineSeries, {
        color: '#f7c97a',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: 'Slow EMA',
      })
      slowLine.setData(overlays.slowEma.map(p => ({ time: toSec(p.time), value: p.value })))
    }

    // ── Buy / Sell markers ──────────────────────────────────────────────
    if (trades.length > 0) {
      const sortedTrades = [...trades].sort((a, b) => a.time - b.time)
      const markers: SeriesMarker<Time>[] = sortedTrades.map(t => ({
        time:     toSec(t.time),
        position: (t.type === 'buy' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        color:    t.type === 'buy' ? '#26a69a' : '#ef5350',
        shape:    (t.type === 'buy' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text:     t.type === 'buy' ? 'B' : 'S',
        size:     1,
      }))
      createSeriesMarkers(candleSeries, markers)
    }

    // ── Pane 1: RSI ─────────────────────────────────────────────────────
    if (overlays.strategy === 'rsi' && overlays.rsi.length > 0) {
      const rsiSeries = chart.addSeries(
        LineSeries,
        {
          color: '#a89cf7',
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
        color: 'rgba(255, 255, 255, 0.12)',
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
          color: p.value >= 0 ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)',
        })),
      )

      const macdLine = chart.addSeries(
        LineSeries,
        {
          color: '#a89cf7',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'MACD',
        },
        1,
      )
      macdLine.setData(overlays.macdLine.map(p => ({ time: toSec(p.time), value: p.value })))

      const signalLine = chart.addSeries(
        LineSeries,
        {
          color: '#f7c97a',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          title: 'Signal',
        },
        1,
      )
      signalLine.setData(overlays.signalLine.map(p => ({ time: toSec(p.time), value: p.value })))

      const panes = chart.panes()
      if (panes[0]) panes[0].setHeight(300)
      if (panes[1]) panes[1].setHeight(140)
    }

    chart.timeScale().fitContent()

    // Resize observer so the chart fills its container when the window changes
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
      chartRef.current = null
    }
  }, [candles, trades, overlays])

  const hasIndicatorPane = overlays.strategy === 'rsi' || overlays.strategy === 'macd'

  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{ height: hasIndicatorPane ? 460 : 320 }}
    />
  )
}
