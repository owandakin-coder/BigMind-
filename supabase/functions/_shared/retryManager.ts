/**
 * retryManager.ts — Exponential backoff retry manager for agent LLM calls.
 *
 * Strategy:
 *  - Max 3 attempts
 *  - Exponential backoff: 1s → 2s → 4s with ±20% jitter
 *  - Fallback provider: if Claude fails after MAX_ATTEMPTS, try GPT-4o-mini
 *  - Non-retryable errors: auth failures, quota exceeded (budget), invalid input
 */

export interface RetryConfig {
  maxAttempts:      number
  baseDelayMs:      number
  maxDelayMs:       number
  jitterFactor:     number  // 0-1, percentage of delay to jitter
  fallbackProvider: 'openai' | null
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts:      3,
  baseDelayMs:      1_000,
  maxDelayMs:       8_000,
  jitterFactor:     0.2,
  fallbackProvider: 'openai',
}

export class RetryableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'RetryableError'
  }
}

export class NonRetryableError extends Error {
  constructor(
    message: string,
    public readonly httpStatus?: number,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'NonRetryableError'
  }
}

export class MaxRetriesExceededError extends Error {
  constructor(
    public readonly attempts: number,
    public readonly lastError: unknown
  ) {
    super(`Max retries (${attempts}) exceeded`)
    this.name = 'MaxRetriesExceededError'
  }
}

/** Returns true if the error should NOT be retried */
function isNonRetryable(error: unknown): boolean {
  if (error instanceof NonRetryableError) return true

  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  const status = (error as { status?: number }).status

  // Auth failures — retrying won't help
  if (status === 401 || status === 403) return true
  // Budget exceeded — retrying won't help
  if (msg.includes('credit') && msg.includes('insufficient')) return true
  if (msg.includes('quota_exceeded') || msg.includes('rate_limit_exceeded')) return true
  // Invalid request — retrying won't help
  if (status === 400 && !msg.includes('timeout')) return true
  // Context length exceeded
  if (msg.includes('context_length_exceeded') || msg.includes('maximum context')) return true

  return false
}

function computeDelay(attempt: number, config: RetryConfig): number {
  const base = config.baseDelayMs * Math.pow(2, attempt - 1)
  const capped = Math.min(base, config.maxDelayMs)
  const jitter = capped * config.jitterFactor * (Math.random() * 2 - 1)
  return Math.round(capped + jitter)
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms))
}

export interface RetryContext {
  attempt:       number
  agentName:     string
  courseId:      string
  usingFallback: boolean
}

export type AgentFn<T> = (ctx: RetryContext) => Promise<T>

/**
 * withRetry — wraps an agent call with retry + fallback logic.
 *
 * @param primaryFn    — Function calling the primary AI provider
 * @param fallbackFn   — Function calling the fallback provider (null = no fallback)
 * @param agentName    — Agent identifier for logging
 * @param courseId     — Course context for logging
 * @param config       — Retry configuration
 *
 * @returns Agent output T
 * @throws MaxRetriesExceededError if all attempts fail
 */
export async function withRetry<T>(
  primaryFn:   AgentFn<T>,
  fallbackFn:  AgentFn<T> | null,
  agentName:   string,
  courseId:    string,
  config:      RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ result: T; attempts: number; usedFallback: boolean }> {
  let lastError: unknown
  let totalAttempts = 0

  // ── Primary provider attempts ─────────────────────────────
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    totalAttempts++
    const ctx: RetryContext = { attempt, agentName, courseId, usingFallback: false }

    try {
      const result = await primaryFn(ctx)
      return { result, attempts: totalAttempts, usedFallback: false }
    } catch (err) {
      lastError = err
      console.warn(`[RetryManager] ${agentName} attempt ${attempt}/${config.maxAttempts} failed:`, err)

      if (isNonRetryable(err)) {
        throw new NonRetryableError(
          `Non-retryable error in ${agentName}: ${err instanceof Error ? err.message : String(err)}`,
          (err as { status?: number }).status,
          err
        )
      }

      if (attempt < config.maxAttempts) {
        const delay = computeDelay(attempt, config)
        console.log(`[RetryManager] Retrying in ${delay}ms…`)
        await sleep(delay)
      }
    }
  }

  // ── Fallback provider attempt ─────────────────────────────
  if (fallbackFn && config.fallbackProvider) {
    totalAttempts++
    const ctx: RetryContext = {
      attempt: 1, agentName, courseId, usingFallback: true,
    }
    console.warn(`[RetryManager] ${agentName} — all primary attempts failed, trying fallback provider`)
    try {
      const result = await fallbackFn(ctx)
      return { result, attempts: totalAttempts, usedFallback: true }
    } catch (fallbackErr) {
      console.error(`[RetryManager] Fallback also failed for ${agentName}:`, fallbackErr)
      lastError = fallbackErr
    }
  }

  throw new MaxRetriesExceededError(totalAttempts, lastError)
}
