// Shared domain types for backtest engine, API, and UI components

export type Candle = {
  time: number   // Unix timestamp ms
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Product = {
  id: string
  baseName: string
  base: string
  assetClass: 'crypto' | 'stock'
}

export type TimeValue = {
  time: number   // Unix timestamp ms
  value: number
}

export type Trade = {
  type: 'buy' | 'sell'
  price: number
  quantity: number
  time: number
  value: number
  pnl?: number
  pnlPct?: number
}

export type BacktestStats = {
  totalReturn: number
  totalReturnAbs: number
  winRate: number
  totalTrades: number
  maxDrawdown: number
  sharpeRatio: number
  sortinoRatio: number
  bestTrade: number
  worstTrade: number
}

export type BacktestResult = {
  trades: Trade[]
  equityCurve: TimeValue[]
  stats: BacktestStats
}

export type StrategySignal = 'buy' | 'sell' | 'hold'

export type StrategyFn = (
  candles: Candle[],
  index: number,
  position: { inPosition: boolean; entryPrice: number },
) => StrategySignal

// A single strategy run result as returned by the API
export type RunResult = {
  label: string
  trades: Trade[]
  equityCurve: TimeValue[]
  stats: BacktestStats
  overlays: OverlayData
}

// Full API response shape
export type BacktestApiResponse = {
  runs: RunResult[]
  benchmarkCurve: TimeValue[]
  candles: Candle[]
  candleCount: number
}

// Chart overlay discriminated union
export type OverlayData =
  | {
      strategy: 'rsi'
      rsi: TimeValue[]
      oversold: number
      overbought: number
    }
  | {
      strategy: 'golden-cross'
      fastEma: TimeValue[]
      slowEma: TimeValue[]
    }
  | {
      strategy: 'macd'
      macdLine: TimeValue[]
      signalLine: TimeValue[]
      histogram: TimeValue[]
    }
