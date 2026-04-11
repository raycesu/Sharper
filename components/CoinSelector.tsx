'use client'

import { useState, useEffect, useRef } from 'react'
import type { Product } from '@/lib/coinbase'

type Props = {
  value: string
  onChange: (id: string) => void
  className?: string
}

export default function CoinSelector({ value, onChange, className }: Props) {
  const [products, setProducts]   = useState<Product[]>([])
  const [query, setQuery]         = useState(value)
  const [open, setOpen]           = useState(false)
  const [loadError, setLoadError] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/products')
      .then(r => r.json())
      .then((data: Product[]) => setProducts(data))
      .catch(() => setLoadError(true))
  }, [])

  // Sync query display when parent changes value externally
  useEffect(() => {
    setQuery(value)
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        // Snap back to last valid selection if query doesn't match
        const match = products.find(p => p.id === value)
        if (match) setQuery(value)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [products, value])

  const filtered = products
    .filter(p =>
      p.id.toLowerCase().includes(query.toLowerCase()) ||
      p.baseName.toLowerCase().includes(query.toLowerCase()) ||
      p.base.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 30)

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={loadError ? 'Failed to load coins' : products.length === 0 ? 'Loading…' : 'Search coins…'}
        autoComplete="off"
        spellCheck={false}
        className={className}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 w-full max-h-52 overflow-y-auto bg-surface-raised border border-border rounded-xl">
          {filtered.map(p => (
            <li
              key={p.id}
              onMouseDown={() => {
                onChange(p.id)
                setQuery(p.id)
                setOpen(false)
              }}
              className={`px-3 py-2 text-sm cursor-pointer flex items-baseline gap-1.5 hover:bg-heading/[0.06] ${
                p.id === value ? 'text-brand' : 'text-foreground/85'
              }`}
            >
              <span className="font-medium">{p.base}</span>
              <span className="text-foreground/50 text-xs">{p.baseName}</span>
              <span className="text-foreground/25 text-xs ml-auto">{p.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
