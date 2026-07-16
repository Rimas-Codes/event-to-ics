import { NextRequest, NextResponse } from 'next/server'
import { parseEventText } from '@/lib/ai-parser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ParseRequestBody {
  text: string
  timezone?: string
}

/**
 * POST /api/ai/parse
 * Body: { text: string, timezone?: string }
 *
 * Calls the AI to extract event details from raw text.
 */
export async function POST(req: NextRequest) {
  try {
    let body: ParseRequestBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.text || body.text.trim().length < 5) {
      return NextResponse.json(
        { error: 'Please paste at least a few words of event text.' },
        { status: 400 },
      )
    }

    const timezone = body.timezone || 'UTC'
    const ai = await parseEventText(body.text, timezone)

    if (!ai.parsed) {
      return NextResponse.json({
        parsed: null,
        raw: ai.raw,
        reasoning: ai.reasoning || null,
        error: ai.error || 'Failed to parse the event.',
      })
    }

    const start = new Date(ai.parsed.startAt)
    const end = new Date(ai.parsed.endAt)

    if (end <= start) {
      return NextResponse.json({
        parsed: ai.parsed,
        reasoning: ai.reasoning || null,
        error: 'Parsed event ends before it starts.',
      })
    }

    return NextResponse.json({
      parsed: ai.parsed,
      raw: ai.raw,
      reasoning: ai.reasoning || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: `Server error: ${message}` },
      { status: 500 },
    )
  }
}
