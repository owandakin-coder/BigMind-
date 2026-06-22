// _shared/aiGateway.ts
// Zero-Trust AI Gateway: PII sanitization, cost metering, audit logging
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AppError } from './errors.ts'

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_COST_PER_CALL_USD = parseFloat(Deno.env.get('MAX_COST_PER_CALL_USD') ?? '0.50')

const COST_PER_TOKEN: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8':              { input: 0.000015,   output: 0.000075   },
  'claude-sonnet-4-6':            { input: 0.000003,   output: 0.000015   },
  'claude-haiku-4-5':             { input: 0.00000025, output: 0.00000125 },
  'gpt-4o':                       { input: 0.000005,   output: 0.000015   },
  'gpt-4o-mini':                  { input: 0.00000015, output: 0.0000006  },
  'llama-3.3-70b-versatile':      { input: 0,          output: 0          },
  'llama-3.1-8b-instant':         { input: 0,          output: 0          },
  'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0, output: 0     },
  'grok-3':                       { input: 0.000003,   output: 0.000015   },
  'grok-3-fast':                  { input: 0.000005,   output: 0.000025   },
  'grok-2-1212':                  { input: 0.000002,   output: 0.000010   },
}

// ─── PII Sanitization ─────────────────────────────────────────────────────────
const PII_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b/g,       replacement: '[EMAIL]'   },
  { pattern: /\b\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: '[PHONE]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g,                   replacement: '[SSN]'     },
  { pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, replacement: '[CARD]' },
  { pattern: /\b(?:sk-[a-zA-Z0-9]{32,}|eyJ[a-zA-Z0-9._-]{20,})\b/g, replacement: '[TOKEN]' },
]

export function sanitizePII(text: string): string {
  return PII_RULES.reduce((t, { pattern, replacement }) => t.replace(pattern, replacement), text)
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface GatewayRequest {
  /** Auto-detected from model name if omitted */
  provider?: 'anthropic' | 'openai' | 'groq' | 'xai'
  model: string
  systemPrompt: string
  userPrompt: string
  courseId: string
  agentName: string
  userId: string
  ragContext?: string
  maxTokens?: number
  temperature?: number
  responseFormat?: 'json' | 'text'
  /** AI credit cost to deduct from user_profiles.ai_credits after successful call */
  creditCost?: number
  /** Service-role Supabase client — required when creditCost is set */
  serviceClient?: ReturnType<typeof createClient>
}

export interface GatewayResponse {
  content: string
  promptTokens: number
  completionTokens: number
  costUsd: number
  durationMs: number
  model: string
}

// ─── Provider auto-detection ──────────────────────────────────────────────────
function detectProvider(model: string): 'anthropic' | 'openai' | 'groq' | 'xai' {
  if (model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('grok')) return 'xai'
  if (
    model.startsWith('llama') ||
    model.startsWith('mixtral') ||
    model.startsWith('gemma') ||
    model.startsWith('meta-llama') ||
    model.startsWith('deepseek')
  ) return 'groq'
  return 'openai'
}

// ─── Core Gateway ─────────────────────────────────────────────────────────────
export async function callAIGateway(req: GatewayRequest): Promise<GatewayResponse> {
  const start    = Date.now()
  const provider = req.provider ?? detectProvider(req.model)

  // 1. Credit pre-check — fail fast if user has no credits
  if (req.creditCost && req.serviceClient && req.userId) {
    const { data: profile } = await req.serviceClient
      .from('user_profiles')
      .select('ai_credits, plan')
      .eq('id', req.userId)
      .single()

    if (profile && profile.plan !== 'enterprise' && profile.ai_credits < req.creditCost) {
      throw new AppError(
        'CREDITS_EXHAUSTED',
        `Insufficient AI credits. Required: ${req.creditCost}, Available: ${profile.ai_credits}`,
        402
      )
    }
  }

  // 2. PII sanitization
  const safeSystem = sanitizePII(req.systemPrompt)
  const safeUser   = sanitizePII(req.userPrompt)

  // 3. Inject RAG context
  const augmentedUser = req.ragContext
    ? `<market_context>\n${req.ragContext}\n</market_context>\n\n${safeUser}`
    : safeUser

  // 4. Dispatch to provider
  let content = '', promptTokens = 0, completionTokens = 0

  if (provider === 'anthropic') {
    ;({ content, promptTokens, completionTokens } = await callAnthropic(
      req.model, safeSystem, augmentedUser, req.maxTokens ?? 4096, req.temperature ?? 0.3
    ))
  } else if (provider === 'groq') {
    ;({ content, promptTokens, completionTokens } = await callGroq(
      req.model, safeSystem, augmentedUser, req.maxTokens ?? 4096, req.temperature ?? 0.3
    ))
  } else if (provider === 'xai') {
    ;({ content, promptTokens, completionTokens } = await callXAI(
      req.model, safeSystem, augmentedUser, req.maxTokens ?? 4096, req.temperature ?? 0.3
    ))
  } else {
    ;({ content, promptTokens, completionTokens } = await callOpenAI(
      req.model, safeSystem, augmentedUser, req.maxTokens ?? 4096, req.temperature ?? 0.3,
      req.responseFormat
    ))
  }

  // 5. Cost metering
  const pricing = COST_PER_TOKEN[req.model] ?? { input: 0, output: 0 }
  const costUsd = (promptTokens * pricing.input) + (completionTokens * pricing.output)

  if (costUsd > MAX_COST_PER_CALL_USD) {
    throw new AppError(
      'COST_CEILING',
      `Call cost $${costUsd.toFixed(4)} exceeds ceiling $${MAX_COST_PER_CALL_USD}`,
      402
    )
  }

  const durationMs = Date.now() - start

  // 6. Credit deduction — fire-and-forget (non-blocking)
  // Use Promise.resolve() because supabase-js PromiseLike builders don't have .catch()
  if (req.creditCost && req.serviceClient && req.userId) {
    Promise.resolve(req.serviceClient.rpc('deduct_ai_credits', {
      p_user_id:    req.userId,
      p_amount:     req.creditCost,
      p_agent_name: req.agentName,
      p_course_id:  req.courseId,
    })).catch((e: unknown) => console.warn('[Gateway] Credit deduction failed (non-fatal):', e))
  }

  // 7. Audit log — fire-and-forget
  if (req.serviceClient) {
    Promise.resolve(req.serviceClient.from('ai_audit_logs').insert({
      user_id:           req.userId,
      course_id:         req.courseId,
      agent_name:        req.agentName,
      model:             req.model,
      prompt_tokens:     promptTokens,
      completion_tokens: completionTokens,
      cost_usd:          costUsd,
      duration_ms:       durationMs,
      credit_cost:       req.creditCost ?? 0,
    })).catch(() => { /* non-fatal */ })
  }

  return { content, promptTokens, completionTokens, costUsd, durationMs, model: req.model }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────
async function callAnthropic(
  model: string, system: string, user: string, maxTokens: number, temperature: number
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return {
    content:          data.content?.[0]?.text ?? '',
    promptTokens:     data.usage?.input_tokens  ?? 0,
    completionTokens: data.usage?.output_tokens ?? 0,
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────
async function callOpenAI(
  model: string, system: string, user: string, maxTokens: number, temperature: number,
  responseFormat?: 'json' | 'text'
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const body: Record<string, unknown> = {
    model, max_tokens: maxTokens, temperature,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  }
  if (responseFormat === 'json') body.response_format = { type: 'json_object' }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return {
    content:          data.choices?.[0]?.message?.content ?? '',
    promptTokens:     data.usage?.prompt_tokens     ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  }
}

// ─── xAI (Grok) ───────────────────────────────────────────────────────────────
async function callXAI(
  model: string, system: string, user: string, maxTokens: number, temperature: number
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const apiKey = Deno.env.get('XAI_API_KEY')
  if (!apiKey) throw new Error('XAI_API_KEY not set')

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`xAI API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return {
    content:          data.choices?.[0]?.message?.content ?? '',
    promptTokens:     data.usage?.prompt_tokens     ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  }
}

// ─── Groq ─────────────────────────────────────────────────────────────────────
async function callGroq(
  model: string, system: string, user: string, maxTokens: number, temperature: number
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const apiKey = Deno.env.get('GROQ_API_KEY')
  console.log(`[callGroq] model=${model} key_present=${!!apiKey}`)
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error(`[callGroq] HTTP ${res.status} model=${model}:`, err)
    throw new Error(`Groq API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  return {
    content:          data.choices?.[0]?.message?.content ?? '',
    promptTokens:     data.usage?.prompt_tokens     ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  }
}

// ─── Embeddings ───────────────────────────────────────────────────────────────
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) throw new Error('OPENAI_API_KEY not set')

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: text }),
  })

  if (!res.ok) throw new Error(`Embeddings API error ${res.status}`)
  const data = await res.json()
  return data.data?.[0]?.embedding ?? []
}

// ─── RAG Context Fetcher ──────────────────────────────────────────────────────
export async function fetchRAGContext(
  serviceClient: ReturnType<typeof createClient>,
  targetNiche:   string,
  maxDocs = 5,
): Promise<string> {
  try {
    const embedding = await generateEmbedding(`Digital course market research for: ${targetNiche}`)

    const { data: docs, error } = await serviceClient.rpc('match_market_embeddings', {
      query_embedding: embedding,
      match_threshold: 0.70,
      match_count:     maxDocs,
    })

    if (error || !docs?.length) return ''

    return docs
      .map((d: { source_label: string; content: string; similarity: number }) =>
        `[${d.source_label} | similarity: ${(d.similarity * 100).toFixed(0)}%]\n${d.content}`)
      .join('\n\n---\n\n')
  } catch (e) {
    console.warn('RAG context fetch failed (non-fatal):', e)
    return ''
  }
}

// ─── Safe JSON Parser ─────────────────────────────────────────────────────────
export function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    console.error('JSON parse failed. Raw output:', raw.slice(0, 500))
    return fallback
  }
}
