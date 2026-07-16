import { getAiSettings, getPreset } from '@/lib/ai-settings'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatCompletionOptions {
  messages: ChatMessage[]
  temperature?: number
}

export interface ChatCompletionResult {
  content: string
  provider: string
  model: string
}

/**
 * Unified chat-completion entry point. Looks up the user's configured AI
 * provider in the DB and routes the request to the right backend.
 */
export async function callChatCompletion(
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const settings = await getAiSettings()
  const preset = getPreset(settings.provider)
  const model = settings.model || preset.defaultModel

  switch (settings.provider) {
    case 'gemini':
      return callGemini(opts, model, settings.apiKey, settings.baseUrl || preset.baseUrl || '')
    case 'anthropic':
      return callAnthropic(opts, model, settings.apiKey, settings.baseUrl || preset.baseUrl || '')
    case 'ollama':
      return callOllama(opts, model, settings.baseUrl || preset.baseUrl || 'http://localhost:11434')
    case 'groq':
    case 'openrouter':
    case 'openai':
    default:
      return callOpenAiCompatible(
        opts,
        model,
        settings.apiKey,
        settings.baseUrl || preset.baseUrl || '',
        settings.provider,
      )
  }
}

/** Returns true if the AI provider is configured and ready to use. */
export async function isAiReady(): Promise<{ ready: boolean; provider: string; reason?: string }> {
  const settings = await getAiSettings()
  const preset = getPreset(settings.provider)
  if (!preset.requiresApiKey) return { ready: true, provider: settings.provider }
  if (!settings.apiKey) {
    return {
      ready: false,
      provider: settings.provider,
      reason: `No API key set for ${preset.label}. Open Settings to configure it.`,
    }
  }
  return { ready: true, provider: settings.provider }
}

/* -------------------------------------------------------------------------- */
/* Provider implementations                                                   */
/* -------------------------------------------------------------------------- */

/** OpenAI-compatible providers: Groq, OpenRouter, OpenAI. */
async function callOpenAiCompatible(
  opts: ChatCompletionOptions,
  model: string,
  apiKey: string,
  baseUrl: string,
  provider: string,
): Promise<ChatCompletionResult> {
  if (!apiKey) {
    throw new Error(
      `API key is required for the "${provider}" provider. Open Settings to configure it.`,
    )
  }
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://cadence.app'
    headers['X-Title'] = 'Event-to-ICS'
  }

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
  }
  const hasSystemJsonInstruction = opts.messages.some(
    (m) => m.role === 'system' && /json/i.test(m.content),
  )
  if (hasSystemJsonInstruction) {
    body.response_format = { type: 'json_object' }
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${provider} API error (${res.status}): ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content ?? ''
  return { content, provider, model }
}

/** Google Gemini generateContent REST API. */
async function callGemini(
  opts: ChatCompletionOptions,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<ChatCompletionResult> {
  if (!apiKey) {
    throw new Error('API key is required for Google Gemini. Get one free at aistudio.google.com/apikey.')
  }
  const systemMessages = opts.messages.filter((m) => m.role === 'system')
  const userMessages = opts.messages.filter((m) => m.role !== 'system')

  const body: Record<string, unknown> = {
    contents: userMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      responseMimeType: 'application/json',
    },
  }
  if (systemMessages.length > 0) {
    body.systemInstruction = {
      parts: [{ text: systemMessages.map((m) => m.content).join('\n\n') }],
    }
  }

  const url = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini API error (${res.status}): ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join('') ?? ''
  return { content, provider: 'gemini', model }
}

/** Anthropic Messages API. */
async function callAnthropic(
  opts: ChatCompletionOptions,
  model: string,
  apiKey: string,
  baseUrl: string,
): Promise<ChatCompletionResult> {
  if (!apiKey) {
    throw new Error('API key is required for Anthropic Claude. Get one at console.anthropic.com.')
  }
  const systemMessages = opts.messages.filter((m) => m.role === 'system')
  const userMessages = opts.messages.filter((m) => m.role !== 'system')

  const url = `${baseUrl.replace(/\/$/, '')}/messages`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: opts.temperature ?? 0.2,
      system: systemMessages.map((m) => m.content).join('\n\n'),
      messages: userMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Anthropic API error (${res.status}): ${text.slice(0, 300)}`)
  }

  const data = await res.json()
  const content = data.content?.map((c: { text?: string }) => c.text).join('') ?? ''
  return { content, provider: 'anthropic', model }
}

/** Local Ollama server (no API key needed). */
async function callOllama(
  opts: ChatCompletionOptions,
  model: string,
  baseUrl: string,
): Promise<ChatCompletionResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`
  const hasSystemJsonInstruction = opts.messages.some(
    (m) => m.role === 'system' && /json/i.test(m.content),
  )
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    stream: false,
    options: { temperature: opts.temperature ?? 0.2 },
  }
  if (hasSystemJsonInstruction) {
    body.format = 'json'
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `Ollama error (${res.status}). Is Ollama running at ${baseUrl}? Run "ollama serve". Detail: ${text.slice(0, 200)}`,
    )
  }

  const data = await res.json()
  const content = data.message?.content ?? ''
  return { content, provider: 'ollama', model }
}