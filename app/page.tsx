import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-52px)] bg-background flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
      <div className="relative flex flex-col items-center w-full max-w-[560px]">
        {/* Very subtle radial glow behind logo */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 w-[min(100%,520px)] h-[320px] -translate-y-[12%]"
          style={{
            background:
              'radial-gradient(ellipse 55% 45% at 50% 42%, rgba(107, 142, 255, 0.06) 0%, transparent 70%)',
          }}
        />

        <div className="relative mb-7">
          <Image
            src="/brand/sharper-logo.png"
            alt="Sharper"
            width={280}
            height={112}
            priority
            className="object-contain w-[min(280px,85vw)] h-auto"
            style={{ width: 'auto', height: 'auto' }}
          />
        </div>

        <p className="relative text-[11px] uppercase tracking-[0.15em] text-[#6B8EFF] font-medium mb-5 select-none">
          Become Sharper
        </p>

        <h1 className="relative text-[32px] leading-tight font-medium text-[#F0F0F8] max-w-[520px] tracking-tight">
          <span className="block">Backtest crypto and equity trading strategies</span>
          <span className="block">against real historical data</span>
        </h1>

        <p className="relative mt-4 text-base text-[#A0A0B0]">no account required</p>

        <Link
          href="/backtest"
          className="relative mt-10 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-[#6B8EFF] to-[#7C5CFC] px-8 py-3 text-[15px] font-medium text-white border-0 shadow-none hover:brightness-[1.06] transition-[filter] duration-150"
        >
          Open backtester
        </Link>
      </div>

      <p className="mt-14 text-[11px] text-[#555568] max-w-sm">
        Powered by Coinbase &amp; Yahoo Finance · Past performance is not indicative of future results
      </p>
    </div>
  )
}
