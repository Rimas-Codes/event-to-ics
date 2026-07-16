import { callChatCompletion } from '@/lib/ai-client'

export interface ParsedEvent {
  title: string
  description?: string
  location?: string
  startAt: string // ISO string
  endAt: string // ISO string
  allDay: boolean
  reminderMinutes: number
  confidence: 'high' | 'medium' | 'low'
  notes?: string
  resolution?: string
  originalTime?: string | null
  originalTimezone?: string | null
}

export interface AIParseResult {
  parsed: ParsedEvent | null
  raw: string
  reasoning?: string
  error?: string
}

const SYSTEM_PROMPT = `You are an AI scheduling assistant.
The user will paste raw text containing an event invitation (an email, a chat message, a meeting invite, etc).
Your job: extract the event details as strict JSON.

============================================================
CURRENT CONTEXT — use this to resolve every relative expression:
============================================================
- Current UTC time: {CURRENT_TIME}
- Current date in user's local timezone: {LOCAL_DATE} ({CURRENT_DOW})
- User's local timezone: {USER_TZ}

============================================================
PRE-COMPUTED DATE REFERENCE — USE THESE EXACT DATES.
============================================================
LLMs are bad at computing weekday dates. Do NOT compute weekday dates yourself.
Use these pre-computed dates verbatim when the user says "next Tuesday", "tomorrow", etc.

{DATE_REFERENCE}

============================================================
DATE RESOLUTION RULES — VERY IMPORTANT:
============================================================
- "next Tuesday" / "next Monday" / "next Friday" etc. = the date listed as "Next <weekday>" in the PRE-COMPUTED DATE REFERENCE above.
- "this Tuesday" = the Tuesday of the current calendar week (Mon-Sun).
- "tomorrow" = the date listed as "Tomorrow" above. "today" / "tonight" = current date.
- "in 3 days" / "in a week" = current date + N days (use the calendar above to count).
- "on July 15" / "on 15 July" = that absolute date in the current year.
- "next week" + a weekday = that weekday in the NEXT calendar week (7 days after the "Next <weekday>" date listed above).
- "next month" = the same day-of-month in the next calendar month.
- When the text offers multiple day options, pick the FIRST option mentioned and note the alternatives in the "notes" field.
- CRITICAL: Always verify the weekday matches. If the user says "Tuesday" but your chosen date is not a Tuesday, you made a mistake — re-check the PRE-COMPUTED DATE REFERENCE.

============================================================
TIMEZONE RULES — VERY IMPORTANT:
============================================================
- ONLY convert timezones if the source text EXPLICITLY names a timezone.
- If the source text does NOT mention a timezone, DO NOT convert. Use the time as-is in the user's local timezone ({USER_TZ}).
- The user's timezone ({USER_TZ}) may contain "Pacific" in its name (e.g. "Pacific/Auckland" is NZ, NOT US Pacific).
- When the text DOES name a timezone, convert to UTC. Common US timezone mappings:
  - "PST"/"PDT"/"US Pacific" -> UTC-8 winter, UTC-7 summer
  - "EST"/"EDT"/"US Eastern" -> UTC-5 winter, UTC-4 summer
  - "CST"/"CDT"/"US Central" -> UTC-6 winter, UTC-5 summer
  - "MST"/"MDT"/"US Mountain" -> UTC-7 winter, UTC-6 summer
- Other: "GMT"/"UTC"/"Z" -> UTC+0, "BST" -> UTC+1, "CET" -> UTC+1, "CEST" -> UTC+2, "IST" -> UTC+5:30, "JST" -> UTC+9, "AEST" -> UTC+10, "AEDT" -> UTC+11
- Always output startAt and endAt as ISO 8601 strings in UTC ending in "Z".

============================================================
OUTPUT RULES — VERY IMPORTANT:
============================================================
1. Respond with ONE single JSON object and NOTHING else. No markdown fences, no commentary.
2. Output "localDate" (YYYY-MM-DD) and "localTime" (HH:MM 24h) in the USER'S LOCAL timezone ({USER_TZ}).
3. Output "durationMinutes" for event duration.
4. Infer sensible defaults: meeting/call -> 30min, lunch/coffee -> 60min, interview -> 60min, workshop -> 2-3h, conference -> 8h, party/dinner -> 3h, default -> 60min.
5. For all-day events: set allDay=true, localTime="00:00", durationMinutes=1440.
6. Suggest reminderMinutes: all-day -> 480, meeting/call -> 15, flight -> 1440, default -> 15.
7. Set confidence: "high" when all explicit, "medium" when one inferred, "low" when ambiguous.
8. Title should be SHORT and descriptive. Prefer "Meeting with <name>" over bare "meeting".
9. ALWAYS populate "resolution" with a short explanation that INCLUDES THE WEEKDAY AND DATE (e.g. "next Tuesday = July 14, 2026").
10. ALWAYS populate "originalTime" and "originalTimezone".
11. ALWAYS populate "reasoning" with a concise step-by-step explanation of how you interpreted the text — quote the exact phrase from the user's text, then state which date from the PRE-COMPUTED DATE REFERENCE you used. Write it in 2-4 clear sentences.

JSON shape:
{
  "title": string,
  "description": string | null,
  "location": string | null,
  "localDate": string (YYYY-MM-DD in user's timezone),
  "localTime": string (HH:MM 24h in user's timezone),
  "durationMinutes": number,
  "startAt": string (ISO UTC),
  "endAt": string (ISO UTC),
  "allDay": boolean,
  "reminderMinutes": number,
  "confidence": "high" | "medium" | "low",
  "resolution": string,
  "reasoning": string,
  "originalTime": string | null,
  "originalTimezone": string | null,
  "notes": string | null
}`

/**
 * Calls the AI to parse raw event text into a structured ParsedEvent.
 */
export async function parseEventText(
  rawText: string,
  userTimezone: string = 'UTC',
): Promise<AIParseResult> {
  try {
    const now = new Date()
    const localDateStr = formatLocalDate(now, userTimezone)
    const localDow = formatLocalDow(now, userTimezone)
    const dateReference = buildDateReference(now, userTimezone)

    const systemPrompt = SYSTEM_PROMPT
      .replace('{CURRENT_TIME}', now.toISOString())
      .replace('{LOCAL_DATE}', localDateStr)
      .replace('{CURRENT_DOW}', localDow)
      .replace('{USER_TZ}', userTimezone)
      .replace('{DATE_REFERENCE}', dateReference)

    const result = await callChatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      temperature: 0.1,
    })

    const content = result.content
    const parsed = extractJson(content)
    if (!parsed) {
      const snippet = content.length > 400 ? content.slice(0, 400) + '...' : content
      return {
        parsed: null,
        raw: content,
        error: `Could not extract JSON from ${result.provider} (${result.model}) response. Raw output: "${snippet}"`,
      }
    }

    if (!parsed.title) {
      return {
        parsed: null,
        raw: content,
        error: `AI response missing required field: title. Got keys: [${Object.keys(parsed).join(', ')}].`,
      }
    }

    let startAt: string
    let endAt: string

    if (parsed.localDate && parsed.localTime) {
      const dateStr = `${parsed.localDate}T${parsed.localTime}:00`
      const localDate = new Date(dateStr)

      if (isNaN(localDate.getTime())) {
        if (parsed.startAt && parsed.endAt) {
          startAt = String(parsed.startAt)
          endAt = String(parsed.endAt)
        } else {
          return {
            parsed: null,
            raw: content,
            error: `Could not parse localDate/localTime: "${parsed.localDate}" "${parsed.localTime}"`,
          }
        }
      } else {
        const utcDate = localToUtc(localDate, userTimezone)
        const durationMinutes = Number(parsed.durationMinutes ?? 60)
        const endDate = new Date(utcDate.getTime() + durationMinutes * 60 * 1000)
        startAt = utcDate.toISOString()
        endAt = endDate.toISOString()
      }
    } else if (parsed.startAt && parsed.endAt) {
      startAt = String(parsed.startAt)
      endAt = String(parsed.endAt)
    } else {
      return {
        parsed: null,
        raw: content,
        error: `AI response missing date/time fields. Expected localDate+localTime or startAt+endAt.`,
      }
    }

    // Extract reasoning from parsed JSON or from raw content (thinking blocks)
    let reasoning = parsed.reasoning ? String(parsed.reasoning) : null
    if (!reasoning) {
      const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i)
      if (thinkMatch) {
        reasoning = thinkMatch[1].trim()
      }
    }

    return {
      parsed: {
        title: String(parsed.title),
        description: parsed.description ?? null,
        location: parsed.location ?? null,
        startAt,
        endAt,
        allDay: Boolean(parsed.allDay),
        reminderMinutes: Number(parsed.reminderMinutes ?? 15),
        confidence: (parsed.confidence ?? 'medium') as ParsedEvent['confidence'],
        notes: parsed.notes ?? null,
        resolution: parsed.resolution ? String(parsed.resolution) : null,
        originalTime: parsed.originalTime ? String(parsed.originalTime) : null,
        originalTimezone: parsed.originalTimezone ? String(parsed.originalTimezone) : null,
      },
      raw: content,
      reasoning: reasoning || undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { parsed: null, raw: '', error: message }
  }
}

function formatLocalDate(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    }).format(d)
  } catch {
    return d.toDateString()
  }
}

function formatLocalDow(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: tz,
    }).format(d)
  } catch {
    return 'unknown'
  }
}

/**
 * Builds a pre-computed date reference for the LLM, so it does not have to
 * do weekday date arithmetic itself (which LLMs routinely get wrong).
 *
 * Output is a bulleted list including:
 *   - Today / Tomorrow / Day after tomorrow
 *   - The very next occurrence of each weekday (counting from tomorrow, per
 *     the "next <weekday>" rule in the prompt)
 *   - Common relative offsets: "In 3 days", "In 1 week"
 *
 * All dates are computed in the user's timezone so the LLM sees the same
 * calendar the user does.
 */
function buildDateReference(now: Date, tz: string): string {
  // Format helpers — all use the user's timezone.
  const longFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  })
  const isoFmt = new Intl.DateTimeFormat('en-CA', {
    // en-CA gives us YYYY-MM-DD natively
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: tz,
  })
  const dowFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: tz,
  })

  const fmtLong = (d: Date) => longFmt.format(d)
  const fmtIso = (d: Date) => isoFmt.format(d)
  const fmtDow = (d: Date) => dowFmt.format(d)

  const lines: string[] = []
  const today = new Date(now)

  // Today / Tomorrow / Day after tomorrow
  lines.push(`- Today (${fmtDow(today)}): ${fmtLong(today)}  [${fmtIso(today)}]`)
  const tomorrow = addDays(today, 1)
  lines.push(`- Tomorrow (${fmtDow(tomorrow)}): ${fmtLong(tomorrow)}  [${fmtIso(tomorrow)}]`)
  const dayAfter = addDays(today, 2)
  lines.push(`- Day after tomorrow (${fmtDow(dayAfter)}): ${fmtLong(dayAfter)}  [${fmtIso(dayAfter)}]`)

  // "Next <weekday>" = the very next occurrence of that weekday, counting from tomorrow.
  // So if today is Sunday, "next Tuesday" = the Tuesday that comes after tomorrow (Monday).
  // If today is Tuesday, "next Tuesday" = the Tuesday of next week (7 days from today).
  const weekdayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ]
  // Get the weekday number of "tomorrow" in the user's timezone (0=Sun ... 6=Sat).
  const tomorrowDowStr = fmtDow(tomorrow)
  const tomorrowDow = weekdayNames.indexOf(tomorrowDowStr)
  for (let offset = 0; offset < 7; offset++) {
    const targetDow = (tomorrowDow + offset) % 7
    // Days from today to the target weekday = 1 (tomorrow) + offset
    const targetDate = addDays(today, 1 + offset)
    const weekdayName = weekdayNames[targetDow]
    lines.push(
      `- Next ${weekdayName}: ${fmtLong(targetDate)}  [${fmtIso(targetDate)}]`,
    )
  }

  // Common relative offsets
  const in3 = addDays(today, 3)
  lines.push(`- In 3 days (${fmtDow(in3)}): ${fmtLong(in3)}  [${fmtIso(in3)}]`)
  const in7 = addDays(today, 7)
  lines.push(`- In 1 week (${fmtDow(in7)}): ${fmtLong(in7)}  [${fmtIso(in7)}]`)

  return lines.join('\n')
}

/** Returns a new Date N days later (does not mutate the input). */
function addDays(d: Date, days: number): Date {
  const copy = new Date(d)
  copy.setDate(copy.getDate() + days)
  return copy
}

function localToUtc(localDate: Date, _timezone: string): Date {
  return localDate
}

/**
 * Best-effort extraction of the first balanced JSON object from a model response.
 */
function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null
  let t = text.trim()

  // Strip reasoning blocks
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  // Strip markdown code fences
  const fenceMatch = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenceMatch) {
    t = fenceMatch[1].trim()
  }

  try {
    return JSON.parse(t)
  } catch {
    // continue
  }

  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return null
  let slice = t.slice(first, last + 1)

  try {
    return JSON.parse(slice)
  } catch {
    // continue
  }

  const noTrailingCommas = slice.replace(/,\s*([}\]])/g, '$1')
  if (noTrailingCommas !== slice) {
    try {
      return JSON.parse(noTrailingCommas)
    } catch {
      slice = noTrailingCommas
    }
  }

  const doubleQuoted = slice.replace(/'/g, '"')
  if (doubleQuoted !== slice) {
    try {
      return JSON.parse(doubleQuoted)
    } catch {
      // give up
    }
  }

  return null
}
