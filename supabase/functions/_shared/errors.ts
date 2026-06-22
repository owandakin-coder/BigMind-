// _shared/errors.ts
import { jsonResponse } from './cors.ts'

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const Errors = {
  unauthorized:     (msg = 'Unauthorized')              => new AppError('UNAUTHORIZED',      msg, 401),
  forbidden:        (msg = 'Forbidden')                 => new AppError('FORBIDDEN',         msg, 403),
  notFound:         (msg = 'Not found')                 => new AppError('NOT_FOUND',         msg, 404),
  badRequest:       (msg = 'Bad request')               => new AppError('BAD_REQUEST',       msg, 400),
  creditExhausted:  (msg = 'AI credit limit reached')   => new AppError('CREDIT_EXHAUSTED',  msg, 402),
  stateMismatch:    (msg = 'State machine violation')   => new AppError('STATE_MISMATCH',    msg, 409),
  costCeiling:      (msg = 'Cost ceiling exceeded')     => new AppError('COST_CEILING',      msg, 402),
  timeout:          (msg = 'Agent execution timed out') => new AppError('TIMEOUT',           msg, 504),
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return jsonResponse({ error: err.code, message: err.message }, err.httpStatus)
  }
  const message = err instanceof Error ? err.message : 'Internal server error'
  console.error('[UNHANDLED]', err)
  return jsonResponse({ error: 'INTERNAL_ERROR', message }, 500)
}
