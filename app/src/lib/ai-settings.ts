// AI Settings — provider configuration stored in the SQLite Settings table.

import { db } from '@/lib/db'

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export interface AiSettings {
  provider: string
  model: string
  apiKey: string
  baseUrl: string
}

export interface AiModelOption {
  id: string
  label: string
}

export interface AiPreset {
  id: string
  label: string
  tier: 'free' | 'paid' | 'local'
  requiresApiKey: boolean
  defaultModel: string
  models: AiModelOption[]
  baseUrl: string
  hint?: string
  apiKeyUrl?: string
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                     */
/* -------------------------------------------------------------------------- */

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'groq',
    label: 'Groq',
    tier: 'free',
    requiresApiKey: true,
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B (fast)' },
      { id: 'gemma2-9b-it', label: 'Gemma 2 9B' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    ],
    baseUrl: 'https://api.groq.com/openai/v1',
    hint: 'Free, fast inference. Get a key at console.groq.com.',
    apiKeyUrl: 'https://console.groq.com/keys',
  },
]

export function getPreset(providerId: string): AiPreset {
  return AI_PRESETS.find((p) => p.id === providerId) ?? AI_PRESETS[0]
}

/* -------------------------------------------------------------------------- */
/* CRUD helpers                                                                */
/* -------------------------------------------------------------------------- */

const SETTINGS_KEY = 'ai'

const DEFAULTS: AiSettings = {
  provider: 'groq',
  model: 'llama-3.3-70b-versatile',
  apiKey: '',
  baseUrl: '',
}

async function readRaw(): Promise<string> {
  try {
    const row = await db.setting.findUnique({ where: { key: SETTINGS_KEY } })
    return row?.value ?? ''
  } catch {
    return ''
  }
}

async function writeRaw(json: string): Promise<void> {
  await db.setting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: json },
    create: { key: SETTINGS_KEY, value: json },
  })
}

export async function getAiSettings(): Promise<AiSettings> {
  const raw = await readRaw()
  if (!raw) return { ...DEFAULTS }
  try {
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await writeRaw(JSON.stringify(settings))
}

export async function clearAiSettings(): Promise<void> {
  await db.setting.deleteMany({ where: { key: SETTINGS_KEY } }).catch(() => {})
}

/** Mask the API key for safe client-side display. */
export function maskApiKey(settings: AiSettings): AiSettings & { hasApiKey: boolean } {
  const hasApiKey = !!settings.apiKey && settings.apiKey.length > 0
  return {
    ...settings,
    hasApiKey,
    apiKey: hasApiKey
      ? settings.apiKey.slice(0, 4) + '••••••••' + settings.apiKey.slice(-4)
      : '',
  }
}

/** Merge an incoming partial update with the existing saved settings.
 *  If the incoming apiKey is the masked version (contains •), keep the saved one. */
export function mergeApiKey(
  incoming: Partial<AiSettings>,
  saved: AiSettings,
): AiSettings {
  const isMasked = !!incoming.apiKey && incoming.apiKey.includes('•')
  return {
    ...saved,
    ...incoming,
    apiKey: isMasked ? saved.apiKey : (incoming.apiKey ?? saved.apiKey),
  }
}