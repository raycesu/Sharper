import { NextRequest, NextResponse } from 'next/server'
import { fetchProducts, searchStockProducts } from '@/lib/market-data'

export async function GET(req: NextRequest) {
  try {
    const assetClass = (req.nextUrl.searchParams.get('assetClass') ?? 'crypto') as 'crypto' | 'stock'
    const query      = req.nextUrl.searchParams.get('q') ?? ''

    // Live symbol search — only for stocks and when a query is provided
    if (assetClass === 'stock' && query.trim().length >= 1) {
      const results = await searchStockProducts(query.trim())
      return NextResponse.json(results)
    }

    const products = await fetchProducts(assetClass)
    return NextResponse.json(products)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
