// perform-approval-action/index.ts
// Standalone Edge Function wrapping the perform_approval_action RPC.
// Provides: input validation, rate limiting, and structured response envelope.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.22'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { Errors, errorResponse } from '../_shared/errors.ts'
import { checkRateLimit } from '../_shared/rateLimit.ts'

const Schema = z.object({
  approvalId: z.string().uuid('approvalId must be a valid UUID'),
  action:     z.enum(['approve','reject','regenerate','pivot','approve_and_lock']),
  feedback:   z.string().max(2000).optional(),
})

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )

    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) throw Errors.unauthorized()

    // Rate limit: max 30 approvals per minute (fast UI actions)
    const rl = await checkRateLimit(user.id, 'approval', 30)
    if (!rl.allowed) {
      return jsonResponse({ error: 'RATE_LIMITED', retryAfter: rl.resetAt }, 429)
    }

    const body = await req.json()
    const parsed = Schema.safeParse(body)
    if (!parsed.success) throw Errors.badRequest(parsed.error.message)
    const { approvalId, action, feedback } = parsed.data

    // Sanitize feedback
    const safeFeedback = feedback?.replace(/[<>]/g, '').trim()

    // Call the SECURITY DEFINER RPC — it validates ownership + state transition
    const { data, error } = await supabase.rpc('perform_approval_action', {
      p_approval_id: approvalId,
      p_action:      action,
      p_feedback:    safeFeedback ?? null,
    })

    if (error) {
      // Map PostgreSQL error codes to HTTP responses
      if (error.message.includes('approval_not_found_or_unauthorized')) {
        throw Errors.notFound('Approval not found or you do not have access')
      }
      if (error.message.includes('invalid_state_transition')) {
        throw Errors.stateMismatch(error.message)
      }
      if (error.message.includes('no_transition_mapping')) {
        throw Errors.stateMismatch(`No valid transition for this action at current status`)
      }
      throw new Error(error.message)
    }

    // If action is 'regenerate', trigger the appropriate agent via execute-agent-workflow
    if (action === 'regenerate' && data.new_status) {
      // Fire-and-forget: n8n will pick up the status from the DB webhook
      // The regeneration is handled by the DB trigger → n8n → execute-agent-workflow
    }

    return jsonResponse({
      success:    true,
      approvalId,
      action,
      newStatus:  data.new_status,
      locked:     data.locked ?? false,
      feedback:   safeFeedback,
    })
  } catch (err) {
    return errorResponse(err)
  }
})
