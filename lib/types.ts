// Shared types used by the backtest API response and the frontend chart components

export type TimeValue = {
  time: number   // Unix timestamp ms
  value: number
}

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
