'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/backtest', label: 'Backtester' },
] as const

export default function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 flex h-[52px] shrink-0 items-stretch border-b border-border bg-[#0D0D0F] px-8">
      <div className="flex w-full max-w-none items-stretch gap-10">
        <Link href="/" className="flex items-center">
          <span className="select-none font-bold tracking-tight text-brand-gradient text-[15px]">
            Sharper
          </span>
        </Link>
        <nav className="flex items-stretch gap-1">
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
                  'flex items-center border-b-2 px-1 text-[14px] transition-colors',
                  active
                    ? 'border-[#6B8EFF] text-[#F0F0F8]'
                    : 'border-transparent text-[#A0A0B0] hover:text-[#F0F0F8]',
                ].join(' ')}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
