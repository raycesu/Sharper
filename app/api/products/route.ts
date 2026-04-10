import { NextResponse } from 'next/server'
import { fetchProducts } from '@/lib/coinbase'

export async function GET() {
  try {
    const products = await fetchProducts()
    return NextResponse.json(products)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
