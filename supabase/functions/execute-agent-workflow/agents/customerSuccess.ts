import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { CustomerSuccessOutputSchema, type CustomerSuccessOutput } from '../../_shared/agentSchemas.ts'
import { customerSuccessPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'customer_success_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export async function runCustomerSuccess(
  input:         { courseId: string; userId: string; niche: string },
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  // Load engagement and success signals
  const [
    { data: analyticsEvents },
    { data: revenueEvents },
    { data: csEvents },
    { data: course },
  ] = await Promise.all([
    serviceClient.from('analytics_events').select('*').eq('course_id', courseId).order('created_at', { ascending: false }).limit(200),
    serviceClient.from('revenue_events').select('*').eq('course_id', courseId).order('occurred_at', { ascending: false }).limit(100),
    serviceClient.from('customer_success_events').select('*').eq('course_id', courseId).order('occurred_at', { ascending: false }).limit(100),
    serviceClient.from('courses').select('title, price_usd').eq('id', courseId).single(),
  ])

  // Compute engagement signals from analytics
  const completionEvents = (analyticsEvents ?? []).filter(e => e.event_type === 'lesson_completion')
  const avgCompletionRate = completionEvents.length > 0
    ? completionEvents.reduce((s, e) => s + Number(e.event_value), 0) / completionEvents.length
    : 0

  const refundEvents = (revenueEvents ?? []).filter(e => e.event_type === 'refund')
  const refundRate   = (revenueEvents?.length ?? 0) > 0
    ? refundEvents.length / (revenueEvents!.length)
    : 0

  const systemPrompt = customerSuccessPrompts.buildSystemPrompt()
  const userPrompt   = customerSuccessPrompts.buildUserPrompt({
    courseId,
    niche,
    courseTitle:      course?.title ?? niche,
    avgCompletionRate,
    refundRate,
    totalStudents:    (revenueEvents ?? []).filter(e => e.event_type === 'purchase').length,
    recentCsEvents:   (csEvents ?? []).slice(0, 20),
    dropOffPoints:    (analyticsEvents ?? []).filter(e => e.event_type === 'lesson_dropout').map(e => e.metadata),
  })

  const { result: rawOutput, usedFallback } = await withRetry(
    async (ctx) => {
      const resp = await callAIGateway({
        model: ctx.usingFallback ? 'gpt-4o' : 'claude-sonnet-4-6',
        systemPrompt, userPrompt, maxTokens: 6144,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    async () => {
      const resp = await callAIGateway({
        model: 'gpt-4o', systemPrompt, userPrompt, maxTokens: 6144,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    AGENT_NAME, courseId, DEFAULT_RETRY_CONFIG
  )

  if (usedFallback) telemetry.fallbackActivated('claude_unavailable')

  const parsed    = parseJsonSafe<CustomerSuccessOutput>(rawOutput, {} as CustomerSuccessOutput)
  const validated = CustomerSuccessOutputSchema.safeParse({ ...parsed, course_id: courseId })

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Customer success validation: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('CustomerSuccessOutputSchema')

  // Record this CS run as a success event
  await serviceClient.from('customer_success_events').insert({
    course_id:   courseId,
    event_type:  'health_assessment',
    metadata:    {
      health_score:   output.health_summary.overall_health_score,
      nps_trend:      output.health_summary.nps_trend,
      at_risk_count:  output.at_risk_segments.length,
    },
    occurred_at: new Date().toISOString(),
  })
  telemetry.dbWrite('customer_success_events', 1)

  // Insert interventions for at-risk segments
  const interventionInserts = output.interventions.map(intervention => ({
    course_id:        courseId,
    segment:          intervention.target_segment,
    intervention_type: intervention.type,
    priority:         intervention.priority,
    message_template: intervention.message_template,
    trigger_condition: intervention.trigger_condition,
    expected_impact:  intervention.expected_impact,
    metadata:         { agent_run: new Date().toISOString() },
    status:           'pending',
  }))

  if (interventionInserts.length > 0) {
    await serviceClient.from('customer_success_interventions').insert(interventionInserts)
    telemetry.dbWrite('customer_success_interventions', interventionInserts.length)
  }

  // Persist full CS report as digital asset
  await serviceClient.from('digital_assets').insert({
    course_id:   courseId,
    source_type: 'course',
    source_id:   courseId,
    asset_type:  'customer_success_report',
    content:     output as unknown as Record<string, unknown>,
    is_active:   true,
    metadata:    {
      health_score:   output.health_summary.overall_health_score,
      at_risk_count:  output.at_risk_segments.length,
    },
  })
  telemetry.dbWrite('digital_assets', 1)

  const nextStatus = 'customer_success_active'

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: nextStatus,
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      health_score:       output.health_summary.overall_health_score,
      nps_trend:          output.health_summary.nps_trend,
      interventions_queued: interventionInserts.length,
      at_risk_segments:   output.at_risk_segments.length,
    },
  })
  telemetry.statusTransitioned('seo_optimization', nextStatus)

  return {
    nextStatus,
    outputSummary: {
      health_score:          output.health_summary.overall_health_score,
      nps_trend:             output.health_summary.nps_trend,
      at_risk_segments:      output.at_risk_segments.length,
      interventions_queued:  interventionInserts.length,
      course_improvements:   output.course_improvement_suggestions.length,
    },
  }
}
