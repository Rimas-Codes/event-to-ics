/**
 * ICS (iCalendar) file generator.
 * Generates .ics files that can be imported into Google Calendar, Outlook,
 * Apple Calendar, and any other calendar application.
 */

export interface IcsEvent {
  title: string
  description?: string | null
  location?: string | null
  startAt: string // ISO 8601 UTC string
  endAt: string // ISO 8601 UTC string
  allDay: boolean
  reminderMinutes?: number
  emailReminder?: boolean
}

/**
 * Generates an ICS file content string from an event object.
 */
export function generateIcs(event: IcsEvent): string {
  const uid = generateUid()
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const startDate = new Date(event.startAt)
  const endDate = new Date(event.endAt)

  let dtStart: string
  let dtEnd: string

  if (event.allDay) {
    // All-day events use DATE format (YYYYMMDD), no time
    dtStart = formatIcsDate(startDate)
    dtEnd = formatIcsDate(endDate)
  } else {
    // Timed events use UTC format (YYYYMMDDTHHMMSSZ)
    dtStart = formatIcsDateTime(startDate)
    dtEnd = formatIcsDateTime(endDate)
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Event to ICS//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART${event.allDay ? ';VALUE=DATE' : ''}:${dtStart}`,
    `DTEND${event.allDay ? ';VALUE=DATE' : ''}:${dtEnd}`,
    `SUMMARY:${escapeIcs(event.title)}`,
  ]

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeIcs(event.description)}`)
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeIcs(event.location)}`)
  }

  // Add display reminder alarm (standard popup)
  if (event.reminderMinutes && event.reminderMinutes > 0) {
    lines.push('BEGIN:VALARM')
    lines.push('ACTION:DISPLAY')
    lines.push(`DESCRIPTION:Reminder: ${escapeIcs(event.title)}`)
    lines.push(`TRIGGER:-PT${formatDuration(event.reminderMinutes)}`)
    lines.push('END:VALARM')
  }

  // Add email reminder (1 day before)
  if (event.emailReminder) {
    lines.push('BEGIN:VALARM')
    lines.push('ACTION:EMAIL')
    lines.push(`SUMMARY:Reminder: ${escapeIcs(event.title)}`)
    lines.push(`DESCRIPTION:This is a reminder that "${escapeIcs(event.title)}" is coming up tomorrow.`)
    lines.push('TRIGGER:-P1D')
    lines.push('END:VALARM')
  }

  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')

  return lines.join('\r\n')
}

/**
 * Triggers a browser download of an ICS file.
 */
export function downloadIcs(event: IcsEvent): void {
  const icsContent = generateIcs(event)
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `${sanitizeFilename(event.title)}.ics`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Format a Date as ICS DATE value (YYYYMMDD). */
function formatIcsDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/** Format a Date as ICS UTC DATETIME value (YYYYMMDDTHHMMSSZ). */
function formatIcsDateTime(d: Date): string {
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const s = String(d.getUTCSeconds()).padStart(2, '0')
  return `${y}${mo}${day}T${h}${mi}${s}Z`
}

/** Format minutes into ICS duration (e.g., 15 -> "15M", 90 -> "1H30M", 1440 -> "24H"). */
function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}H${m}M`
  if (h > 0) return `${h}H`
  return `${m}M`
}

/** Escape special ICS characters in text values. */
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
}

/** Generate a unique ID for the event. */
function generateUid(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${timestamp}-${random}@event-to-ics`
}

/** Sanitize event title for use as a filename. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 60) || 'event'
}
