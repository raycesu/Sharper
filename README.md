# Sharper

Sharper is a Next.js app for **backtesting crypto and equity strategies** against historical OHLCV data.

- **Crypto data**: Binance (global + Binance US symbol resolution)
- **Equity data**: Twelve Data (curated universe + live symbol search)
- **Execution model**: Server-side backtest API with deterministic strategy logic
- **Intervals**: Every strategy currently registered uses **weekly** candles (`1w`). The `/api/backtest` route and the backtest UI coerce the interval to `1w` whenever a weekly-only strategy is selected (see `WEEKLY_ONLY_STRATEGY_IDS` in `app/api/backtest/route.ts`).

No accounts are required. Choose an instrument, date range, and capital, then run simulations directly in the browser.

## Requirements

- **Node.js** 20 or newer (recommended)
- **npm** (or use your preferred package manager and adjust commands)

## Setup

```bash
npm install
```

### Environment variables

Create `.env.local` in the project root (Next.js loads it automatically).


| Variable              | Required       | Purpose                                                                                        |
| --------------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `TWELVE_DATA_API_KEY` | For **stocks** | Twelve Data API key for equity symbols, search, and candles. Crypto backtests work without it. |


### Crypto data notes

- Binance REST endpoint: `GET /api/v3/klines`
- Kline values are returned as strings and parsed with `parseFloat`
- `volume` maps to base-asset volume (`[5]`)
- `quoteVolume` maps to quote-asset volume (`[7]`) and should be used for cross-asset volume normalization (for example, Z-score comparisons)

Do not commit `.env.local`. Keys are read on the server (API routes).

## Scripts


| Command               | Description                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`         | Development server with Turbopack. Runs a small `prep-dev` step so the first dev session has valid `.next` output. |
| `npm run dev:webpack` | Same as dev but uses the webpack bundler instead of Turbopack.                                                     |
| `npm run build`       | Production build.                                                                                                  |
| `npm start`           | Serve the production build (run `build` first).                                                                    |
| `npm run preview`     | `build` then `start` for a local production check.                                                                 |
| `npm test`            | Run Vitest tests for strategy and API route behavior.                                                              |


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
- **Benchmark mapping by asset**
  - `Stock` assets benchmark against `SPY` (broad US equity market proxy)
  - `Crypto` assets benchmark against `BTCUSDT` (market beta proxy for most crypto names)
  - `BTC` specifically benchmarks against `SPY` (cross-market comparison versus broad risk asset conditions)
- **Benchmark timestamps**
  - Benchmark RSI (and the buy-and-hold benchmark curve) use a **backward as-of** join: for each asset bar, the latest benchmark bar with `time <=` that asset bar is used. That avoids silent `hold` signals when Binance and Twelve Data weekly opens differ slightly.
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
- **Hardcoded parameters (actual values in code)**
  - `RSI length` = `14` (asset and benchmark)
  - `Absolute weakness threshold` = `45` (`assetRSI < 45`)
  - `Relative gap threshold` = `7.5` (`benchmarkRSI > assetRSI + 7.5`)
  - `Relativity Index entry threshold` = `7.5` (`benchmarkRSI - assetRSI > 7.5`)
  - `Rollover arm level` = `60` (start rollover tracking after first cross above 60)
  - `Rollover confirmation` = `2` consecutive weeks below peak RSI (`weeksBelowPeak >= 2`)
  - `Relativity flip exit threshold` = `-15` (`benchmarkRSI - assetRSI <= -15`)
  - `Fee` = `0.001` (0.1%)
  - `Position size` = `1` (100% allocation)

### Why this strategy structure

- Uses **relative strength divergence** to enter when the asset underperforms benchmark materially (mean-reversion style setup).
- Uses dual exits (momentum rollover + benchmark-relative failure) to avoid staying in trades after regime deterioration.
- Weekly cadence reduces noise and aligns with a swing/position-style signal profile.

### Volume Momentum Strategy (`volume-momentum-weekly`)

Defined in `lib/scoreEngine.ts` (`scoreCandleArray`) and executed in `app/api/backtest/route.ts`.

- **Composite index**
  - Per-week **score** on `[-2, +2]`: combines volume trend, price position in range, RSI-shaped magnitude, and a price-deceleration modifier (see formula below)
  - Supporting series on each scored candle: **RSI(14)** (Wilder smoothing), **`decel_factor`**, **`low_10w`** (10-week rolling low of close)
- **Execution timeframe**
  - Weekly candles only (`1w`)
  - API enforces weekly interval regardless of request interval for this strategy
- **Benchmark mapping**
  - Same as other runs in this API: benchmark curve is computed from `resolveBenchmark` (e.g. `SPY` for stocks and `BTC`, `BTCUSDT` for most crypto) for side-by-side context—strategy signals use **asset OHLCV only**
- **Minimum data requirement**
  - At least `15` candles (score is `0` until index `15`; full formula needs earlier history inside that window)
- **Entry logic**
  - **Score crossover** on the signal candle `t`: `score[t-1] < 1.0` and `score[t] >= 1.0` (cross above `1.0`, not merely trading above it)
  - **RSI filter**: `RSI[t] < 50` (avoid entering when weekly momentum is already stretched)
  - **Deceleration filter**: `decel_factor[t] > 1` (selling pressure slowing vs the prior two-week comparison—not a falling-knife acceleration)
  - **Price proximity**: `close[t] <= low_10w[t] * 1.2` (still within **20%** of the 10-week low—no chasing extended rebounds)
  - If all pass: **buy at the open of candle `t+1`**
  - **Position sizing** at signal candle `t`:
    - `score[t] >= 1.5` → **100%** of available cash
    - `score[t] >= 1.0` → **50%** of available cash
- **Exit logic**
  - **RSI rollover only**: once `RSI` first crosses **above `60`**, track **peak RSI**; if RSI prints **lower than peak for two consecutive weeks**, sell on the next open (`rsiRollover`)
  - Rollover state resets when the position closes and on each new entry
  - If still in a position after the last candle, force-close at the final close (`forcedClose`)
- **Backtest execution settings**
  - Trading fee **`0.1%`** (`fee: 0.001`)
  - Benchmark curve returned with the response like other strategies

#### Index formula (`score`) — what is computed

For candle index `t` (week `t`):

1. **Warm-up**  
   If `t < 15`: `score = 0`, `decel_factor = 1` (RSI and `low_10w` may still be attached for charts when defined).

2. **Volume trend component — `V_trend` (weight `0.6` in the raw blend)**  
   Compare average volume in two **3-week** blocks:
   - `vol_recent = mean(vol[t], vol[t-1], vol[t-2])`
   - `vol_prior = mean(vol[t-3], vol[t-4], vol[t-5])`
   - `vol_slope = (vol_recent - vol_prior) / vol_prior` (if `vol_prior === 0`, then `V_trend = 0`)
   - **Invert** the slope so **declining** volume trends bullish (exhaustion), **rising** volume at highs trends bearish (distribution):
     - `V_trend = clamp(vol_slope * -3, -1, 1)`  
   The **`-3`** stretches small percentage moves into a usable `[-1, 1]` shape before blending.

3. **Price context component — `P_context` (weight `0.4` in the raw blend)**  
   Where is **close** within the last **10 weeks** (closes `t-9 … t`)?
   - `low_10w = min(close[t-9..t])`, `high_10w = max(close[t-9..t])`, `range = high_10w - low_10w`
   - If `range === 0`: `P_context = 0`
   - Else `range_position = (close[t] - low_10w) / range`, then  
     `P_context = clamp(1 - range_position * 2, -1, 1)`  
   So **at the 10-week low** → `+1` (bullish context), **at the high** → `-1` (bearish), mid-range → near `0`.

4. **RSI gate — `gate` (multiplier, not added)**  
   Uses **RSI(14)** at `t`. Asymmetric by design: **amplify** oversold opportunity, **dampen** overbought noise (buy-the-dip detector, not a symmetric oscillator).
   - If RSI is not yet defined at `t`: `gate = 0.6`
   - Else:
     - `RSI < 35` → `gate = 1.5`
     - `RSI < 45` → `gate = 1.2`
     - `RSI < 55` → `gate = 0.6` (**dead zone** — suppress churn)
     - `RSI < 65` → `gate = 0.8`
     - else → `gate = 0.5` (**strong damp** when extended)

5. **Price deceleration filter — `decel_factor`**  
   Compare **2-week** vs **4-week** percentage momentum of close:
   - `momentum_recent = (close[t] - close[t-2]) / close[t-2]`
   - `momentum_prior = (close[t-2] - close[t-4]) / close[t-4]`
   - If `close[t-2] === 0` or `close[t-4] === 0`: `decel_factor = 1`  
   - Else `decel_factor = clamp(1 + (momentum_prior - momentum_recent), 0.5, 1.5)`  
   When the **rate of decline slows**, `momentum_prior` is more negative than `momentum_recent` → factor **`> 1`** (boost). When the decline **accelerates** (“falling knife”), factor **`< 1`** (suppress).

6. **Blend and final score**
   - `raw = V_trend * 0.6 + P_context * 0.4`
   - `score = clamp(raw * gate * decel_factor * 2, -2, 2)`  
   The trailing **` * 2`** maps the blended core into the **`±2`** interpretive band.

**Reading the score (interpretive bands)**

- **`+1.5` to `+2.0`**: strong accumulation / seller exhaustion — strongest bullish regime on this index
- **`+1.0` to `+1.5`**: mild accumulation — actionable “interest” zone (entries tie to crossover at **`1.0`**)
- **`-0.5` to `+1.0`**: neutral / noisy — no structural signal from this composite alone
- **Below `-0.5`**: distribution / overheated context on the blend (chart reference only; **exit is RSI rollover**, not score alone)

#### Hardcoded parameters (actual values in code)

| Parameter | Value | Role |
| --------- | ----- | ---- |
| Warm-up index cutoff | `15` | No blended score before index `15` (`score = 0`) |
| Volume block length | `3` weeks each | `vol_recent` vs `vol_prior` windows |
| Volume slope scale | `-3` | Inverts slope and scales into `[-1, 1]` before clamp |
| `V_trend` / `P_context` weights | `0.6` / `0.4` | Weights inside `raw` |
| 10-week context window | `10` closes | `t-9 … t` inclusive |
| RSI period | `14` | Wilder RSI used for `gate` and trade filters |
| RSI gate ladder | `1.5`, `1.2`, `0.6`, `0.8`, `0.5` | Buckets at `<35`, `<45`, `<55`, `<65`, else |
| RSI gate when RSI undefined | `0.6` | Neutral multiplier until RSI exists |
| Deceleration clamp | `0.5 … 1.5` | Bounds on `decel_factor` |
| Final score clamp | `-2 … 2` | Hard limits on `score` |
| Entry crossover | `< 1.0` → `≥ 1.0` | Prior vs current week score |
| Entry RSI cap | `50` | Require `RSI < 50` |
| Entry deceleration | `> 1.0` | Require slowing decline |
| Entry proximity to 10w low | `1.2` | `close <= low_10w * 1.2` |
| Size tiers | `1.5` / `1.0` | Full vs half cash |
| Rollover arm | `60` | Start peak tracking after `RSI > 60` |
| Rollover confirmation | `2` weeks | Two consecutive weeks below peak RSI |
| Fee | `0.001` | 0.1% per trade side |

#### Chart thresholds (overlay reference lines)

- `scoreStrong = 1.5`
- `scoreEntry = 1.0`
- `scoreExit = -0.5` (visual reference for bearish / distribution side of the composite)
- `zero = 0`

### Why this strategy structure (volume momentum)

- **Volume trend** favors setups where **participation is drying up into lows** (possible exhaustion) and treats **rising volume into strength** as heavier, distribution-prone context—aligned with how discretionary traders read climactic vs sustained volume.
- **10-week price context** anchors the signal to **where price sits in its recent range**, so the same volume pattern means something different at the bottom third vs top third of the band.
- The **RSI gate** is deliberately **asymmetric**: reward readings that support “opportunity,” mute the middle band to reduce churn, and pull down magnitude when the market is already extended—without using RSI as a simple symmetric entry line.
- **Deceleration** acts as a **regime filter**: prefer entries when downside velocity is **easing**, and suppress signals when the tape is **accelerating lower**.
- **Entries** require a **confirmed improvement** in the composite (cross above `1.0`), **cheap RSI**, **non-chasing** proximity to the 10-week low, and **slowing selling**—stacked filters for one style of weekly swing accumulation.
- **Exit** uses the same **RSI rollover** discipline as the relative-RSI strategy family: stay with momentum until participation rolls off **two weeks in a row** from a post-60 peak, avoiding a single noisy spike-out.

## Project layout

- `app/` — App Router pages (`/`, `/backtest`) and API routes (`/api/backtest`, etc.)
- `components/` — Shared UI (charts, instrument selector, header)
- `lib/` — Backtest engine, strategies, market data providers, indicators, types

## Deploy

Deploy like any Next.js app (e.g. [Vercel](https://vercel.com/docs/frameworks/nextjs)). Set `TWELVE_DATA_API_KEY` in the host’s environment if you need stock backtesting in production.

---

*Past performance is not indicative of future results. This tool is for historical simulation, not financial advice.*