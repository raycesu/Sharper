import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-53px)] bg-[#0d0d14] flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-4xl font-semibold text-white mb-3 tracking-tight">
        Sharp<span className="text-[#a89cf7]">er</span>
      </h1>
      <p className="text-white/40 text-base mb-8 max-w-sm">
        Backtest crypto trading strategies against real historical data —
        no account required.
      </p>
      <Link
        href="/backtest"
        className="px-6 py-2.5 bg-[#a89cf7] hover:bg-[#baaff9] text-[#1a1630] font-semibold rounded-lg text-sm transition-colors"
      >
        Open backtester
      </Link>
      <p className="mt-8 text-xs text-white/20">
        Powered by Coinbase public market data · Past performance is not indicative of future results
      </p>
    </div>
  )
}
