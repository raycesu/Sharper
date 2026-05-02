'use client'

import { useState, useEffect, useRef } from 'react'
import type { Product } from '@/lib/types'

type ProductsPayload = {
  products?: Product[]
  warning?: string | null
}

const parseProductsResponse = (data: unknown): { products: Product[]; warning: string | null } => {
  if (Array.isArray(data)) return { products: data, warning: null }
  if (data && typeof data === 'object' && 'products' in data) {
    const row = data as ProductsPayload
    const products = Array.isArray(row.products) ? row.products : []
    const warning = typeof row.warning === 'string' ? row.warning : null
    return { products, warning }
  }
  return { products: [], warning: null }
}

type Props = {
  assetClass: 'crypto' | 'stock'
  value:      string
  onChange:   (id: string) => void
  className?: string
}

export default function InstrumentSelector({ assetClass, value, onChange, className }: Props) {
  const [baseProducts, setBaseProducts] = useState<Product[]>([])  // curated / crypto list
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [query, setQuery]         = useState(value)
  const [open, setOpen]           = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [serverWarning, setServerWarning] = useState<string | null>(null)

  const wrapperRef  = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reload the base product list whenever the asset class changes
  useEffect(() => {
    setLoadError(false)
    setBaseProducts([])
    setSearchResults([])
    setServerWarning(null)
    fetch(`/api/products?assetClass=${assetClass}`)
      .then(r => r.json())
      .then((data: unknown) => {
        const { products, warning } = parseProductsResponse(data)
        setBaseProducts(products)
        setServerWarning(warning)
      })
      .catch(() => setLoadError(true))
  }, [assetClass])

  // Sync the visible query text when the parent commits a new value
  useEffect(() => { setQuery(value) }, [value])

  // Debounced live search (stocks only)
  useEffect(() => {
    if (assetClass !== 'stock' || !query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setIsSearching(true)

    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(`/api/products?assetClass=stock&q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        const { products, warning } = parseProductsResponse(data)
        setSearchResults(products)
        if (warning) setServerWarning(warning)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 280)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [assetClass, query])

  // Revert to the committed value when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value)
        setSearchResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [value])

  // Commit a choice from the dropdown
  const commit = (id: string) => {
    onChange(id)
    setQuery(id)
    setOpen(false)
    setSearchResults([])
  }

  // Commit the raw typed value as a ticker (stocks only)
  const commitCustom = () => {
    const ticker = query.trim().toUpperCase()
    if (ticker) commit(ticker)
  }

  // Items to show in the dropdown
  const hasQuery = query.trim().length > 0
  const liveHits = hasQuery && searchResults.length > 0

  const displayItems: Product[] = liveHits
    ? searchResults
    : baseProducts
        .filter(p =>
          !hasQuery ||
          p.id.toLowerCase().includes(query.toLowerCase()) ||
          p.baseName.toLowerCase().includes(query.toLowerCase()) ||
          p.base.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 30)

  const exactMatch = displayItems.some(
    p => p.id.toUpperCase() === query.trim().toUpperCase(),
  )
  // Offer "use as ticker" when the user has typed something that isn't an exact match
  const showCustomRow = assetClass === 'stock' && hasQuery && !exactMatch && !isSearching

  const placeholder = loadError
    ? `Failed to load ${assetClass === 'stock' ? 'stocks' : 'coins'}`
    : isSearching
      ? 'Searching…'
      : baseProducts.length === 0 && !loadError
        ? 'Loading…'
        : assetClass === 'stock'
          ? 'Search any stock ticker…'
          : 'Search coins…'

  return (
    <div ref={wrapperRef} className="relative">
      {serverWarning && assetClass === 'stock' && (
        <p className="mb-1.5 text-[11px] text-amber-500/90" role="status">
          {serverWarning}
        </p>
      )}
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' && assetClass === 'stock') {
            e.preventDefault()
            commitCustom()
          }
          if (e.key === 'Escape') {
            setOpen(false)
            setQuery(value)
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={className}
      />

      {open && (displayItems.length > 0 || showCustomRow) && (
        <ul className="absolute z-50 top-full mt-1 w-full max-h-52 overflow-y-auto bg-surface-raised border border-border rounded-xl">

          {/* "Use as ticker" row — pinned at the top when no exact match */}
          {showCustomRow && (
            <li
              onMouseDown={commitCustom}
              className="px-3 py-2 text-sm cursor-pointer flex items-center gap-2 hover:bg-heading/[0.06] border-b border-border text-brand/80"
            >
              <span className="text-xs opacity-50 shrink-0">↵</span>
              <span>
                Use <strong className="font-semibold">{query.trim().toUpperCase()}</strong> as ticker
              </span>
            </li>
          )}

          {displayItems.map(p => (
            <li
              key={p.id}
              onMouseDown={() => commit(p.id)}
              className={`px-3 py-2 text-sm cursor-pointer flex items-baseline gap-1.5 hover:bg-heading/[0.06] ${
                p.id === value ? 'text-brand' : 'text-foreground/85'
              }`}
            >
              <span className="font-medium shrink-0">{p.base}</span>
              <span className="text-foreground/50 text-xs truncate">{p.baseName}</span>
              <span className="text-foreground/25 text-xs ml-auto shrink-0">{p.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
