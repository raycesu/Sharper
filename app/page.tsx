import Link from 'next/link'

const metrics = [
  { label: 'Strategy return', value: '+38.4%', tone: 'text-[#63E6C7]' },
  { label: 'Max drawdown', value: '12.8%', tone: 'text-[#D8DEF0]' },
  { label: 'Win rate', value: '58%', tone: 'text-[#D8DEF0]' },
] as const

const trustItems = ['No account required', 'Binance + Twelve Data', 'Historical OHLCV'] as const

function BacktestPreview() {
  return (
    <div className="relative w-full overflow-hidden rounded-[8px] border border-white/10 bg-[#0B0E15]/82 shadow-[0_34px_90px_rgba(0,0,0,0.52)] backdrop-blur-xl">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#6B8EFF] to-transparent opacity-90"
      />
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-[12px] font-semibold uppercase text-[#7F8AA4]">Backtest preview</p>
          <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-white">Strategy vs benchmark</h2>
        </div>
        <span className="rounded-full border border-[#3FD6BC]/25 bg-[#3FD6BC]/10 px-3 py-1 text-[12px] font-semibold text-[#63E6C7]">
          Complete
        </span>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-3">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[12px] font-medium text-[#858FA8]">{metric.label}</p>
            <p className={`mt-2 text-[24px] font-semibold tracking-tight ${metric.tone}`}>{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="mx-5 rounded-[8px] border border-white/10 bg-[#080B12] p-4">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#E8ECF7]">Equity curve</p>
          <p className="text-[12px] text-[#7F8AA4]">Weekly candles</p>
        </div>
        <svg
          aria-label="Mock chart comparing strategy performance against a benchmark"
          className="h-[190px] w-full"
          viewBox="0 0 520 190"
          role="img"
        >
          <defs>
            <linearGradient id="strategyFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#7C5CFC" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#6B8EFF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="strategyLine" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#6B8EFF" />
              <stop offset="100%" stopColor="#7C5CFC" />
            </linearGradient>
          </defs>
          {[34, 74, 114, 154].map((y) => (
            <line key={y} x1="0" x2="520" y1={y} y2={y} stroke="#1E2536" strokeWidth="1" />
          ))}
          <path
            d="M0 158 C48 152 62 126 104 130 C145 134 158 108 202 110 C250 112 254 80 306 86 C360 92 368 54 414 58 C460 62 476 36 520 30 L520 190 L0 190 Z"
            fill="url(#strategyFill)"
          />
          <path
            d="M0 158 C48 152 62 126 104 130 C145 134 158 108 202 110 C250 112 254 80 306 86 C360 92 368 54 414 58 C460 62 476 36 520 30"
            fill="none"
            stroke="url(#strategyLine)"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <path
            d="M0 164 C70 160 94 148 138 150 C190 152 230 130 278 134 C346 138 388 102 440 110 C474 115 498 92 520 90"
            fill="none"
            stroke="#3FD6BC"
            strokeDasharray="8 9"
            strokeLinecap="round"
            strokeWidth="3"
          />
          <circle cx="520" cy="30" r="5" fill="#7C5CFC" />
          <circle cx="520" cy="90" r="4" fill="#3FD6BC" />
        </svg>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[8px] border border-white/10 bg-white/[0.025] p-4">
          <p className="text-[13px] font-semibold text-[#E8ECF7]">Strategy stack</p>
          <div className="mt-4 space-y-3">
            {['Trend confirmation', 'Volume momentum', 'Benchmark comparison'].map((item, index) => (
              <div key={item} className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#6B8EFF]/15 text-[12px] font-semibold text-[#9DAFFF]">
                  {index + 1}
                </span>
                <span className="text-[14px] font-medium text-[#B9C1D4]">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[8px] border border-white/10 bg-white/[0.025] p-4">
          <p className="text-[13px] font-semibold text-[#E8ECF7]">Risk metrics</p>
          <div className="mt-4 space-y-3">
            {['Sharpe ratio', 'Sortino ratio'].map((item, index) => (
              <div key={item} className="flex items-center gap-3 text-[13px] font-medium text-[#A9B0C2]">
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-[#6B8EFF]/12 text-[10px] font-semibold text-[#9DAFFF]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#05060A] text-[#A9B0C2]">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 18% 5%, rgba(107, 142, 255, 0.34), transparent 27%), radial-gradient(circle at 80% 16%, rgba(124, 92, 252, 0.28), transparent 28%), radial-gradient(circle at 88% 88%, rgba(63, 214, 188, 0.14), transparent 27%)',
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.34] bg-[linear-gradient(rgba(107,142,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(124,92,252,0.13)_1px,transparent_1px)] bg-[size:64px_64px]"
      />
      <div
        aria-hidden
        className="absolute right-0 top-0 h-[420px] w-[520px] opacity-35 bg-[radial-gradient(circle,rgba(169,176,194,0.34)_1px,transparent_1.5px)] bg-[size:22px_22px]"
      />
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,6,10,0.22)_52%,rgba(5,6,10,0.84)_100%)]" />

      <section className="relative mx-auto grid min-h-screen w-full max-w-[1180px] items-center gap-10 px-5 pb-8 pt-28 sm:px-6 sm:pt-32 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
        <div className="max-w-[610px]">
          <h1 className="max-w-[620px] text-[42px] font-semibold leading-[1.04] tracking-tight text-white sm:text-[56px] lg:text-[64px]">
            Backtest trading ideas against real market history.
          </h1>
          <p className="mt-6 max-w-[560px] text-[18px] leading-8 text-[#B7BFD2]">
            Sharper helps you test crypto and equity strategies on historical candles, compare performance against a
            benchmark, and see risk before you commit to a setup.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/backtest"
              className="inline-flex min-h-12 items-center justify-center rounded-[8px] bg-gradient-to-r from-[#6B8EFF] to-[#7C5CFC] px-6 text-[15px] font-semibold text-white shadow-[0_18px_44px_rgba(107,142,255,0.34)] transition-[filter,transform] hover:-translate-y-0.5 hover:brightness-[1.06]"
            >
              Open backtester
            </Link>
          </div>

          <div className="mt-7 flex max-w-[560px] flex-wrap gap-2">
            {trustItems.map((item) => (
              <span
                key={item}
                className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[12px] font-semibold text-[#AEB7CC]"
              >
                {item}
              </span>
            ))}
          </div>

          <p className="mt-5 max-w-[470px] text-[12px] leading-5 text-[#737D95]">
            Past performance is not indicative of future results.
          </p>
        </div>

        <BacktestPreview />
      </section>
    </div>
  )
}
