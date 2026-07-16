import { NextRequest, NextResponse } from 'next/server'
import { callChatCompletion } from '@/lib/ai-client'
import { getAiSettings, getPreset, mergeApiKey, type AiSettings } from '@/lib/ai-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    let body: { settings?: Partial<AiSettings> }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const saved = await getAiSettings()
    let settings = saved
    if (body.settings) {
      settings = mergeApiKey(body.settings, saved)
    }

    const preset = getPreset(settings.provider)
    if (preset.requiresApiKey && !settings.apiKey) {
      return NextResponse.json(
        { error: `An API key is required for ${preset.label}.` },
        { status: 400 },
      )
    }

    const result = await callChatCompletion({
      messages: [
        {
          role: 'system',
          content: 'You are a test responder. Reply with exactly the word "ok" and nothing else.',
        },
        { role: 'user', content: 'Reply with the word "ok".' },
      ],
      temperature: 0,
    })
    return NextResponse.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      response: result.content.slice(0, 200),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}