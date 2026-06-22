/**
 * errorNormalizer.ts — Converts raw errors from AI providers, Supabase,
 * and internal logic into a consistent AgentError structure.
 */

export type AgentErrorCode =
  | 'VALIDATION_FAILED'      // Zod schema mismatch
  | 'LLM_CALL_FAILED'        // AI provider error
  | 'BUDGET_EXCEEDED'        // Cost ceiling hit
  | 'CREDITS_INSUFFICIENT'   // User out of credits
  | 'RATE_LIMITED'           // Provider rate limit
  | 'CONTEXT_TOO_LONG'       // Prompt exceeds context window
  | 'DB_WRITE_FAILED'        // Supabase persistence failure
  | 'DB_READ_FAILED'         // Supabase read failure
  | 'STATE_TRANSITION_FAILED'// Invalid state machine transition
  | 'COURSE_NOT_FOUND'       // Course doesn't exist
  | 'TIMEOUT'                // Edge Function execution timeout
  | 'MAX_RETRIES_EXCEEDED'   // All retry attempts failed
  | 'INVALID_INPUT'          // Bad request payload
  | 'UNAUTHORIZED'           // Auth failure
  | 'INTERNAL_ERROR'         // Catch-all

export interface AgentError {
  code:           AgentErrorCode
  message:        string
  retryable:      boolean
  httpStatus:     number
  originalError?: unknown
  context?: {
    agentName?:  string
    courseId?:   string
    modelId?:    string
    attempt?:    number
  }
}

const RETRYABLE_CODES: Set<AgentErrorCode> = new Set([
  'LLM_CALL_FAILED',
  'RATE_LIMITED',
  'TIMEOUT',
  'MAX_RETRIES_EXCEEDED',
  'DB_WRITE_FAILED',
])

export function normalizeError(
  error:   unknown,
  context?: AgentError['context']
): AgentError {
  // Already normalized
  if (isAgentError(error)) return { ...error, context: { ...error.context, ...context } }

  const msg = error instanceof Error
    ? error.message
    : typeof (error as Record<string, unknown>)?.message === 'string'
      ? (error as Record<string, unknown>).message as string
      : String(error)
  const status = (error as { status?: number; httpStatus?: number }).status
               ?? (error as { httpStatus?: number }).httpStatus

  let code: AgentErrorCode = 'INTERNAL_ERROR'
  let httpStatus = 500
  let retryable = false

  // ── AI provider errors ────────────────────────────────────
  if (msg.includes('rate_limit') || msg.includes('429') || status === 429) {
    code = 'RATE_LIMITED'; httpStatus = 429; retryable = true
  } else if (msg.includes('context_length') || msg.includes('maximum context')) {
    code = 'CONTEXT_TOO_LONG'; httpStatus = 400; retryable = false
  } else if (msg.includes('budget') || msg.includes('ceiling')) {
    code = 'BUDGET_EXCEEDED'; httpStatus = 402; retryable = false
  } else if (status === 401 || status === 403 || msg.includes('auth') || msg.includes('unauthorized')) {
    code = 'UNAUTHORIZED'; httpStatus = status ?? 401; retryable = false
  } else if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    code = 'TIMEOUT'; httpStatus = 504; retryable = true
  }

  // ── Validation errors ─────────────────────────────────────
  else if (msg.includes('ZodError') || msg.includes('validation') || msg.includes('parse')) {
    code = 'VALIDATION_FAILED'; httpStatus = 422; retryable = true  // retry with better prompt
  }

  // ── Business logic errors ─────────────────────────────────
  else if (msg.includes('insufficient') && msg.includes('credit')) {
    code = 'CREDITS_INSUFFICIENT'; httpStatus = 402; retryable = false
  } else if (msg.includes('Invalid state transition') || msg.includes('state_transition')) {
    code = 'STATE_TRANSITION_FAILED'; httpStatus = 409; retryable = false
  } else if (msg.includes('course') && msg.includes('not found')) {
    code = 'COURSE_NOT_FOUND'; httpStatus = 404; retryable = false
  } else if (msg.includes('Max retries')) {
    code = 'MAX_RETRIES_EXCEEDED'; httpStatus = 503; retryable = false
  } else if (msg.includes('Invalid input') || status === 400) {
    code = 'INVALID_INPUT'; httpStatus = 400; retryable = false
  }

  // ── Supabase errors ───────────────────────────────────────
  else if (msg.includes('PGRST') || msg.includes('supabase')) {
    if (msg.includes('insert') || msg.includes('update') || msg.includes('upsert')) {
      code = 'DB_WRITE_FAILED'; httpStatus = 500; retryable = true
    } else {
      code = 'DB_READ_FAILED'; httpStatus = 500; retryable = true
    }
  }

  // ── LLM failures ──────────────────────────────────────────
  else if (msg.includes('anthropic') || msg.includes('openai') || msg.includes('500')) {
    code = 'LLM_CALL_FAILED'; httpStatus = 502; retryable = true
  }

  return {
    code,
    message:       msg,
    retryable,
    httpStatus,
    originalError: error,
    context,
  }
}

export function isAgentError(err: unknown): err is AgentError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'retryable' in err &&
    'httpStatus' in err
  )
}

/** Convert AgentError to HTTP response body */
export function agentErrorToResponse(err: AgentError): Record<string, unknown> {
  return {
    error: {
      code:      err.code,
      message:   err.message,
      retryable: err.retryable,
    },
    context: err.context ?? {},
  }
}
