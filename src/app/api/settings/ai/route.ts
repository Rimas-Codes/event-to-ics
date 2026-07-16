import { NextRequest, NextResponse } from 'next/server'
import {
  clearAiSettings,
  getAiSettings,
  maskApiKey,
  mergeApiKey,
  saveAiSettings,
  type AiSettings,
} from '@/lib/ai-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const settings = await getAiSettings()
    return NextResponse.json({ settings: maskApiKey(settings) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to load AI settings: ${message}` }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    let body: Partial<AiSettings>
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const saved = await getAiSettings()
    const merged = mergeApiKey(body, saved)
    await saveAiSettings(merged)
    return NextResponse.json({ settings: maskApiKey(merged) })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to save AI settings: ${message}` }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await clearAiSettings()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to clear AI settings: ${message}` }, { status: 500 })
  }
}