# Sharper

Web app for **backtesting crypto and equity strategies** against historical OHLCV data. Crypto data comes from **Coinbase**; equities use **Twelve Data**. No user accounts—configure a run in the browser and simulate.

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

Do not commit `.env.local`. Keys are read on the server (API routes).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server with Turbopack. Runs a small `prep-dev` step so the first dev session has valid `.next` output. |
| `npm run dev:webpack` | Same as dev but uses the webpack bundler instead of Turbopack. |
| `npm run build` | Production build. |
| `npm start` | Serve the production build (run `build` first). |
| `npm run preview` | `build` then `start` for a local production check. |

Open [http://localhost:3000](http://localhost:3000) after `npm run dev`.

## Project layout

- `app/` — App Router pages (`/`, `/backtest`) and API routes (`/api/backtest`, etc.)
- `components/` — Shared UI (charts, selectors, header)
- `lib/` — Backtest engine, market data providers, types

## Deploy

Deploy like any Next.js app (e.g. [Vercel](https://vercel.com/docs/frameworks/nextjs)). Set `TWELVE_DATA_API_KEY` in the host’s environment if you need stock backtesting in production.

---

*Past performance is not indicative of future results. This tool is for historical simulation, not financial advice.*
