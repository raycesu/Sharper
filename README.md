# Sharper

Sharper is a Next.js app for **backtesting crypto and equity strategies** against historical OHLCV data.

- **Crypto data**: Binance (global + Binance US symbol resolution)
- **Equity data**: Twelve Data (curated universe + live symbol search)
- **Execution model**: Server-side backtest API with deterministic strategy logic

No accounts are required. Choose an instrument, date range, and capital, then run simulations directly in the browser.

## Recent Changes

- Migrated crypto market data provider to `lib/binance.ts` and removed legacy Coinbase integration.
- Added robust Binance symbol resolution:
  - normalizes flexible user inputs (`eth-usdt`, `ETH/USDT`, `ETHUSDT`)
  - resolves across Binance global first, then Binance US
  - prioritizes quote assets (`USDT`, `USD`, `USDC`, `BTC`) when picking pairs
- Added weekly-first strategy execution path for `market-rsi-divergence` in `app/api/backtest/route.ts`.
- Added benchmark routing:
  - stock assets benchmark against `SPY`
  - non-BTC crypto assets benchmark against `BTCUSDT`
  - BTC benchmarks against `SPY`
- Added benchmark equity-curve output (`benchmarkCurve`) in API responses for buy-and-hold comparison.
- Updated backtest UI flow (`app/backtest/page.tsx`) to:
  - lock interval to weekly for the active strategy
  - use the new `InstrumentSelector`
  - render improved strategy stats, trade log, and benchmark comparison visuals
- Added test suite with Vitest:
  - strategy behavior coverage (`lib/strategies.test.ts`)
  - API weekly-enforcement and benchmark routing coverage (`app/api/backtest/route.test.ts`)

## Requirements

- **Node.js** 20 or newer (recommended)
- **npm** (or use your preferred package manager and adjust commands)

## Setup

```bash
npm install
```

### Environment variables

Create `.env.local` in the project root (Next.js loads it automatically).

| Variable | Required | Purpose |
|----------|----------|---------|
| `TWELVE_DATA_API_KEY` | For **stocks** | Twelve Data API key for equity symbols, search, and candles. Crypto backtests work without it. |

### Crypto data notes

- Binance REST endpoint: `GET /api/v3/klines`
- Kline values are returned as strings and parsed with `parseFloat`
- `volume` maps to base-asset volume (`[5]`)
- `quoteVolume` maps to quote-asset volume (`[7]`) and should be used for cross-asset volume normalization (for example, Z-score comparisons)

Do not commit `.env.local`. Keys are read on the server (API routes).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server with Turbopack. Runs a small `prep-dev` step so the first dev session has valid `.next` output. |
| `npm run dev:webpack` | Same as dev but uses the webpack bundler instead of Turbopack. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build (run `build` first). |
| `npm run preview` | `build` then `start` for a local production check. |
| `npm test` | Run Vitest tests for strategy and API route behavior. |

Open [http://localhost:3000](http://localhost:3000) after `npm run dev`.

## Implemented Strategy Breakdown

### Active strategy: `market-rsi-divergence`

Defined in `lib/strategies.ts` and run through `app/api/backtest/route.ts`.

- **Indicator set**
  - RSI(14) on target asset candles
  - RSI(14) on benchmark candles
  - Relativity Index = `benchmarkRSI - assetRSI`
- **Execution timeframe**
  - Weekly candles only (`1w`)
  - API enforces weekly interval regardless of request interval for this strategy
- **Entry logic**
  - `assetRSI < 45`
  - `benchmarkRSI > assetRSI + 7.5`
  - `Relativity Index > 7.5`
  - If all are true and no open position, strategy returns `buy`
- **Exit logic**
  - **Rollover exit**:
    - once asset RSI first crosses above `60`, track peak RSI
    - if RSI prints lower values for two consecutive weeks after that peak, return `sell`
  - **Relativity flip exit**:
    - if `Relativity Index <= -15`, return `sell`
- **State behavior**
  - internal rollover state (`hasCrossed60`, `peakRSI`, `weeksBelowPeak`) resets cleanly between trades
- **Backtest execution settings**
  - full capital allocation (`positionSizePct: 1`)
  - trading fee `0.1%` (`fee: 0.001`)
  - benchmark curve returned for side-by-side performance context

### Why this strategy structure

- Uses **relative strength divergence** to enter when the asset underperforms benchmark materially (mean-reversion style setup).
- Uses dual exits (momentum rollover + benchmark-relative failure) to avoid staying in trades after regime deterioration.
- Weekly cadence reduces noise and aligns with a swing/position-style signal profile.

## Project layout

- `app/` — App Router pages (`/`, `/backtest`) and API routes (`/api/backtest`, etc.)
- `components/` — Shared UI (charts, instrument selector, header)
- `lib/` — Backtest engine, strategies, market data providers, indicators, types

## Deploy

Deploy like any Next.js app (e.g. [Vercel](https://vercel.com/docs/frameworks/nextjs)). Set `TWELVE_DATA_API_KEY` in the host’s environment if you need stock backtesting in production.

---

*Past performance is not indicative of future results. This tool is for historical simulation, not financial advice.*
