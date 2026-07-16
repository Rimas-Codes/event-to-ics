'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Mail,
  Settings,
  Sparkles,
  Wand2,
  X,
  FileDown,
  Brain,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { AiSettingsSection } from '@/components/settings/ai-settings-section'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { downloadIcs, type IcsEvent } from '@/lib/ics-generator'

const SAMPLE_TEXT = `Hi there,

Just confirming our meeting next Tuesday at 2pm Pacific. We'll be on Zoom — I'll send the link 5 minutes before. Should take about 30 minutes.

Looking forward to it!

— Alex`

/** Parsed event from the AI. */
interface ParsedEvent {
  title: string
  description?: string | null
  location?: string | null
  startAt: string
  endAt: string
  allDay: boolean
  reminderMinutes: number
  confidence: 'high' | 'medium' | 'low'
  resolution?: string | null
  originalTime?: string | null
  originalTimezone?: string | null
  notes?: string | null
}

interface AIParseResponse {
  parsed: ParsedEvent | null
  raw: string
  reasoning?: string | null
  error?: string
}

/** Local mutable copy of ParsedEvent that the user can edit. */
interface EditableEvent {
  title: string
  description: string
  location: string
  startAt: string
  endAt: string
  allDay: boolean
  reminderMinutes: number
  emailReminder: boolean
}

function parsedToEditable(p: ParsedEvent): EditableEvent {
  return {
    title: p.title,
    description: p.description ?? '',
    location: p.location ?? '',
    startAt: p.startAt,
    endAt: p.endAt,
    allDay: p.allDay,
    reminderMinutes: p.reminderMinutes,
    emailReminder: false,
  }
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function safeJson<T = any>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      throw new Error(
        `Server returned an HTML error page (HTTP ${res.status}). The server may have crashed.`,
      )
    }
    throw new Error(`Server returned an unexpected response (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
}

export default function Home() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [parsed, setParsed] = useState<ParsedEvent | null>(null)
  const [edited, setEdited] = useState<EditableEvent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const [aiProvider, setAiProvider] = useState<string>('')
  const [reasoning, setReasoning] = useState<string | null>(null)
  const [showReasoning, setShowReasoning] = useState(true)

  useEffect(() => {
    fetch('/api/settings/ai', { cache: 'no-store' })
      .then(async (r) => safeJson(r))
      .then((data) => {
        const s = data.settings
        setAiProvider(s?.provider ?? 'groq')
        const presetRequiresKey = s?.provider !== 'ollama'
        setAiReady(!presetRequiresKey || s?.hasApiKey)
      })
      .catch(() => setAiReady(false))
  }, [])

  const handleAnalyze = async () => {
    if (text.trim().length < 5) return
    setLoading(true)
    setError(null)
    setParsed(null)
    setEdited(null)
    setDownloaded(false)
    setReasoning(null)
    setShowReasoning(true)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, timezone: tz }),
      })
      const data = await safeJson<AIParseResponse>(res)
      if (!res.ok) {
        throw new Error((data as any).error || `Failed (${res.status})`)
      }
      setParsed(data.parsed)
      setReasoning(data.reasoning || null)
      if (data.parsed) {
        setEdited(parsedToEditable(data.parsed))
      }
      if (data.error) {
        setError(data.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!edited) return
    const icsEvent: IcsEvent = {
      title: edited.title.trim() || 'Untitled event',
      description: edited.description.trim() || null,
      location: edited.location.trim() || null,
      startAt: edited.startAt,
      endAt: edited.endAt,
      allDay: edited.allDay,
      reminderMinutes: edited.reminderMinutes,
      emailReminder: edited.emailReminder,
    }
    downloadIcs(icsEvent)
    setDownloaded(true)
  }

  const handleReset = () => {
    setText('')
    setParsed(null)
    setEdited(null)
    setError(null)
    setDownloaded(false)
    setReasoning(null)
    setShowReasoning(true)
  }

  const handleSettingsChanged = () => {
    fetch('/api/settings/ai', { cache: 'no-store' })
      .then(async (r) => safeJson(r))
      .then((data) => {
        const s = data.settings
        setAiProvider(s?.provider ?? 'groq')
        const presetRequiresKey = s?.provider !== 'ollama'
        setAiReady(!presetRequiresKey || s?.hasApiKey)
      })
      .catch(() => setAiReady(false))
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <CalendarClock className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <h1 className="text-base font-semibold">Event to ICS</h1>
              <p className="text-xs text-muted-foreground">AI-Powered Event Extractor</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => setSettingsOpen(true)}
              aria-label="AI Settings"
              title="AI Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <div className="space-y-6">
          {/* Info section */}
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p>
              Paste an email, message, or event invitation below. The AI will extract the event
              details and let you{' '}
              <span className="font-medium text-foreground">download it as an .ics file</span>{' '}
              that you can import into{' '}
              <span className="font-medium text-foreground">Google Calendar</span> or{' '}
              <span className="font-medium text-foreground">Outlook</span>.
            </p>
          </div>

          {/* AI not configured banner */}
          {aiReady === false && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-amber-900 dark:text-amber-200">
                    AI provider not configured
                  </p>
                  <p className="text-amber-800 dark:text-amber-300">
                    The AI needs a provider API key to parse events. Get a free key from Groq (recommended) or Google Gemini.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSettingsOpen(true)}
                    className="mt-2 h-7 border-amber-400 bg-white text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200"
                  >
                    <Settings className="h-3 w-3" />
                    Configure AI provider
                  </Button>
                </div>
              </div>
            </div>
          )}

          {aiReady === true && (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              AI ready — using {aiProvider}
            </div>
          )}

          {/* Text input */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold leading-tight">Paste your event text</h2>
                  <p className="text-xs text-muted-foreground">
                    An email, invite, message — anything with event details.
                  </p>
                </div>
              </div>

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste an email, invite, or message containing an event…"
                rows={6}
                className="resize-none font-mono text-sm"
                disabled={loading}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleAnalyze} disabled={loading || text.trim().length < 5 || aiReady === false}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      Extract event
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setText(SAMPLE_TEXT)}
                  disabled={loading || !!text}
                  className="text-xs"
                >
                  Use sample
                </Button>
                {(text || parsed) && (
                  <Button variant="ghost" size="sm" onClick={handleReset} className="ml-auto text-xs">
                    <X className="h-3 w-3" />
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Loading state */}
          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 py-16 text-center"
              >
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Reading your message and extracting the event details…
                </p>
              </motion.div>
            )}

            {/* Downloaded success */}
            {!loading && downloaded && (
              <motion.div
                key="downloaded"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700 dark:bg-emerald-950/40"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <div className="flex-1 space-y-2">
                    <h3 className="font-semibold text-emerald-900 dark:text-emerald-200">
                      Event downloaded!
                    </h3>
                    <p className="text-sm text-emerald-800 dark:text-emerald-300">
                      Your .ics file has been downloaded. You can now import it into:
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <div className="rounded-md border border-emerald-200 bg-white/60 px-3 py-2 text-xs dark:border-emerald-800 dark:bg-emerald-950/60">
                        <p className="font-medium text-emerald-900 dark:text-emerald-200">Google Calendar</p>
                        <p className="text-emerald-700 dark:text-emerald-400">Open Google Calendar → Settings → Import &amp; Export → Select file</p>
                      </div>
                      <div className="rounded-md border border-emerald-200 bg-white/60 px-3 py-2 text-xs dark:border-emerald-800 dark:bg-emerald-950/60">
                        <p className="font-medium text-emerald-900 dark:text-emerald-200">Outlook</p>
                        <p className="text-emerald-700 dark:text-emerald-400">Double-click the .ics file, or drag it into your Outlook calendar</p>
                      </div>
                    </div>
                    {edited?.emailReminder && (
                      <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs dark:border-sky-800 dark:bg-sky-950/60">
                        <p className="font-medium text-sky-900 dark:text-sky-200">
                          <Mail className="mr-1 inline h-3 w-3" />
                          Email reminder included
                        </p>
                        <p className="text-sky-700 dark:text-sky-400">
                          A day-before email VALARM has been added to the .ics file. Note: email reminders require your calendar app to support ACTION:EMAIL alarms (Google Calendar ignores these; Outlook and Apple Calendar support them).
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={handleDownload}>
                        <Download className="h-3.5 w-3.5" />
                        Download again
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleReset}>
                        Extract another event
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Editable event form */}
            {!loading && !downloaded && edited && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* AI Reasoning Panel */}
                {reasoning && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/30">
                    <button
                      type="button"
                      onClick={() => setShowReasoning(!showReasoning)}
                      className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                        <span className="text-sm font-medium text-violet-900 dark:text-violet-200">
                          How the AI interpreted this
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-violet-500 dark:text-violet-400">
                          click to {showReasoning ? 'collapse' : 'expand'}
                        </span>
                      </div>
                      {showReasoning ? (
                        <ChevronUp className="h-4 w-4 text-violet-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-violet-500" />
                      )}
                    </button>
                    <AnimatePresence>
                      {showReasoning && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-violet-200 px-4 py-3 space-y-3 dark:border-violet-800">
                            {/* Quick-glance interpretation grid */}
                            {(parsed?.originalTime || parsed?.originalTimezone || parsed?.resolution) && (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                {parsed?.originalTime && (
                                  <div className="rounded-md border border-violet-200 bg-white/60 px-2.5 py-1.5 dark:border-violet-800 dark:bg-violet-950/40">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">
                                      Original time
                                    </p>
                                    <p className="text-xs text-violet-900 dark:text-violet-200">
                                      {parsed.originalTime}
                                    </p>
                                  </div>
                                )}
                                {parsed?.originalTimezone && (
                                  <div className="rounded-md border border-violet-200 bg-white/60 px-2.5 py-1.5 dark:border-violet-800 dark:bg-violet-950/40">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">
                                      Original timezone
                                    </p>
                                    <p className="text-xs text-violet-900 dark:text-violet-200">
                                      {parsed.originalTimezone}
                                    </p>
                                  </div>
                                )}
                                {parsed?.resolution && (
                                  <div className="rounded-md border border-violet-200 bg-white/60 px-2.5 py-1.5 dark:border-violet-800 dark:bg-violet-950/40">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">
                                      Resolved to
                                    </p>
                                    <p className="text-xs text-violet-900 dark:text-violet-200">
                                      {parsed.resolution}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Full step-by-step reasoning from the LLM */}
                            <p className="text-sm leading-relaxed text-violet-800 dark:text-violet-300 whitespace-pre-line">
                              {reasoning}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold">Review &amp; edit event details</h3>
                      {parsed?.confidence && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px]',
                            parsed.confidence === 'high' && 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
                            parsed.confidence === 'medium' && 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
                            parsed.confidence === 'low' && 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
                          )}
                        >
                          {parsed.confidence} confidence
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={edited.title}
                        onChange={(e) => setEdited({ ...edited, title: e.target.value })}
                        placeholder="Event title"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="start">Starts</Label>
                        <Input
                          id="start"
                          type="datetime-local"
                          value={toLocalInput(new Date(edited.startAt))}
                          onChange={(e) => {
                            const d = new Date(e.target.value)
                            if (!isNaN(d.getTime())) {
                              setEdited({ ...edited, startAt: d.toISOString() })
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="end">Ends</Label>
                        <Input
                          id="end"
                          type="datetime-local"
                          value={toLocalInput(new Date(edited.endAt))}
                          onChange={(e) => {
                            const d = new Date(e.target.value)
                            if (!isNaN(d.getTime())) {
                              setEdited({ ...edited, endAt: d.toISOString() })
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={edited.location}
                        onChange={(e) => setEdited({ ...edited, location: e.target.value })}
                        placeholder="Optional location"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="reminder">Reminder</Label>
                        <Select
                          value={String(edited.reminderMinutes)}
                          onValueChange={(v) => setEdited({ ...edited, reminderMinutes: Number(v) })}
                        >
                          <SelectTrigger id="reminder">
                            <SelectValue placeholder="When to remind you" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">At time of event</SelectItem>
                            <SelectItem value="5">5 minutes before</SelectItem>
                            <SelectItem value="10">10 minutes before</SelectItem>
                            <SelectItem value="15">15 minutes before</SelectItem>
                            <SelectItem value="30">30 minutes before</SelectItem>
                            <SelectItem value="60">1 hour before</SelectItem>
                            <SelectItem value="120">2 hours before</SelectItem>
                            <SelectItem value="1440">1 day before</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            id="allDay"
                            checked={edited.allDay}
                            onCheckedChange={(v) => setEdited({ ...edited, allDay: v })}
                          />
                          <Label htmlFor="allDay" className="text-sm">
                            All-day event
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            id="emailReminder"
                            checked={edited.emailReminder}
                            onCheckedChange={(v) => setEdited({ ...edited, emailReminder: v })}
                          />
                          <Label htmlFor="emailReminder" className="text-sm flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Day-before email reminder
                          </Label>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={edited.description}
                        onChange={(e) => setEdited({ ...edited, description: e.target.value })}
                        placeholder="Optional notes, agenda, links…"
                        rows={3}
                      />
                    </div>

                    {parsed?.notes && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        <AlertCircle className="mr-1 inline h-3 w-3" />
                        {parsed.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button variant="ghost" onClick={handleReset}>
                    Discard
                  </Button>
                  <Button
                    onClick={handleDownload}
                    disabled={!edited.title.trim()}
                    size="lg"
                    className="gap-2"
                  >
                    <FileDown className="h-4 w-4" />
                    Download .ics file
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Empty state */}
            {!loading && !edited && !downloaded && !error && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <div className="rounded-full bg-muted p-4">
                  <CalendarClock className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Paste a message above and tap <span className="font-medium">Extract event</span>{' '}
                  to let the AI create a downloadable calendar event.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <footer className="mt-auto border-t bg-muted/20">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 text-xs text-muted-foreground sm:px-6">
          <span>
            <Sparkles className="mr-1 inline h-3 w-3" />
            Event to ICS — AI-powered event extraction
          </span>
          <span>Works with Google Calendar &amp; Outlook</span>
        </div>
      </footer>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Provider Settings
            </DialogTitle>
            <DialogDescription>
              Configure the AI provider for parsing events. A free API key from Groq is recommended.
            </DialogDescription>
          </DialogHeader>
          <AiSettingsSection onChanged={handleSettingsChanged} onExit={() => setSettingsOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
