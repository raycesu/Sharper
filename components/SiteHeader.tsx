'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/backtest', label: 'Backtester' },
] as const

export default function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto grid h-[68px] w-full max-w-[1180px] grid-cols-[1fr_auto_1fr] items-center gap-4 rounded-full border border-white/10 bg-[#06070C]/82 px-4 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:px-5">
        <Link href="/" className="flex h-12 items-center justify-self-start">
          <Image
            src="/brand/sharper_logo.png"
            alt="Sharper"
            width={1921}
            height={819}
            priority
            className="h-12 w-auto select-none"
          />
        </Link>
        <nav className="flex items-center gap-1 justify-self-center rounded-full border border-white/10 bg-white/[0.04] p-1">
          {links.map(({ href, label }) => {
            const active =
              href === '/'
                ? pathname === '/' || pathname === ''
                : pathname === href || pathname.startsWith(`${href}/`)
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'rounded-full px-3 py-2 text-[14px] font-medium transition-colors sm:px-4',
                  active
                    ? 'bg-white/10 text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)]'
                    : 'text-[#A9B0C2] hover:text-white',
                ].join(' ')}
              >
                {label}
              </Link>
            )
          })}
        </nav>
        <div aria-hidden />
      </div>
    </header>
  )
}
