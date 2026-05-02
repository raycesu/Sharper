import { NextRequest, NextResponse } from 'next/server'
import { fetchProducts, searchStockProducts } from '@/lib/market-data'
import type { Product } from '@/lib/types'

export type ProductsApiPayload = {
  products: Product[]
  warning: string | null
}

const hasTwelveDataKey = (): boolean => Boolean((process.env.TWELVE_DATA_API_KEY ?? '').trim())

export async function GET(req: NextRequest) {
  try {
    const assetClass = (req.nextUrl.searchParams.get('assetClass') ?? 'crypto') as 'crypto' | 'stock'
    const query      = req.nextUrl.searchParams.get('q') ?? ''
    const stockKeyMissing = assetClass === 'stock' && !hasTwelveDataKey()

    // Live symbol search — only for stocks and when a query is provided
    if (assetClass === 'stock' && query.trim().length >= 1) {
      const results = await searchStockProducts(query.trim())
      const payload: ProductsApiPayload = {
        products: results,
        warning: stockKeyMissing
          ? 'Live stock search needs TWELVE_DATA_API_KEY on the server.'
          : null,
      }
      return NextResponse.json(payload)
    }

    const products = await fetchProducts(assetClass)
    const payload: ProductsApiPayload = {
      products,
      warning: stockKeyMissing
        ? 'Add TWELVE_DATA_API_KEY to enable live stock symbol search.'
        : null,
    }
    return NextResponse.json(payload)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
