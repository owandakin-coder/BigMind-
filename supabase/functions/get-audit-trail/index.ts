// get-audit-trail/index.ts
// Returns sanitized, time-sorted agent + human interaction log for a course.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.22'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { Errors, errorResponse } from '../_shared/errors.ts'

const Schema = z.object({
  courseId: z.string().uuid(),
  limit:    z.number().int().min(1).max(500).optional().default(100),
  offset:   z.number().int().min(0).optional().default(0),
  eventType: z.enum([
    'execution_start','execution_complete','error','state_transition',
    'hitl_request','hitl_response','regeneration_triggered',
    'pivot_triggered','cost_ceiling_hit',
  ]).optional(),
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

    // Support both POST body and GET query params
    let input: Record<string, unknown>
    if (req.method === 'POST') {
      input = await req.json()
    } else {
      const url = new URL(req.url)
      input = {
        courseId:  url.searchParams.get('courseId'),
        limit:     url.searchParams.has('limit')  ? Number(url.searchParams.get('limit'))  : undefined,
        offset:    url.searchParams.has('offset') ? Number(url.searchParams.get('offset')) : undefined,
        eventType: url.searchParams.get('eventType') ?? undefined,
      }
    }

    const parsed = Schema.safeParse(input)
    if (!parsed.success) throw Errors.badRequest(parsed.error.message)
    const { courseId, limit, offset, eventType } = parsed.data

    // Call SECURITY DEFINER RPC (handles ownership check internally)
    const { data: logs, error } = await supabase.rpc('get_audit_trail', {
      p_course_id: courseId,
    })

    if (error) {
      if (error.message.includes('unauthorized')) throw Errors.forbidden()
      throw new Error(error.message)
    }

    // Apply optional filters and pagination client-side (RPC returns all)
    let filtered = logs ?? []
    if (eventType) {
      filtered = filtered.filter((l: { event_type: string }) => l.event_type === eventType)
    }

    const total    = filtered.length
    const paginated = filtered.slice(offset, offset + limit)

    // Compute cost summary
    const totalCost = filtered
      .filter((l: { total_cost_usd: number }) => l.total_cost_usd)
      .reduce((sum: number, l: { total_cost_usd: number }) => sum + Number(l.total_cost_usd), 0)

    const agentSummary = filtered.reduce((acc: Record<string, { calls: number; costUsd: number }>, l: { agent: string; event_type: string; total_cost_usd: number }) => {
      if (l.event_type !== 'execution_complete') return acc
      if (!acc[l.agent]) acc[l.agent] = { calls: 0, costUsd: 0 }
      acc[l.agent].calls++
      acc[l.agent].costUsd += Number(l.total_cost_usd ?? 0)
      return acc
    }, {})

    return jsonResponse({
      logs:        paginated,
      pagination:  { total, limit, offset, hasMore: offset + limit < total },
      summary:     { totalCostUsd: Number(totalCost.toFixed(6)), agentSummary },
    })
  } catch (err) {
    return errorResponse(err)
  }
})
