import { NextResponse } from 'next/server'
import { STRATEGIES } from '@/lib/server/catalog'

export async function GET() {
  return NextResponse.json(STRATEGIES)
}
