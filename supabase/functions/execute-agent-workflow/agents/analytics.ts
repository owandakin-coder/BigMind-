import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { AnalyticsOutputSchema, type AnalyticsOutput } from '../../_shared/agentSchemas.ts'
import { analyticsPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'analytics_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export async function runAnalytics(
  input:         { courseId: string; userId: string; niche: string; isPreLaunch?: boolean },
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche, isPreLaunch = true } = input

  // Gather existing analytics data
  const { data: analyticsEvents } = await serviceClient
    .from('analytics_events')
    .select('event_type, event_value, metadata')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(200)

  const aggregated = (analyticsEvents ?? []).reduce<Record<string, number[]>>((acc, e) => {
    acc[e.event_type] = acc[e.event_type] ?? []
    acc[e.event_type].push(Number(e.event_value))
    return acc
  }, {})

  const analyticsData = Object.fromEntries(
    Object.entries(aggregated).map(([k, vals]) => [
      k,
      vals.reduce((s, v) => s + v, 0) / vals.length,
    ])
  )

  const systemPrompt = analyticsPrompts.buildSystemPrompt()
  const userPrompt   = analyticsPrompts.buildUserPrompt({ courseId, niche, analyticsData, isPreLaunch })

  const { result: rawOutput, usedFallback } = await withRetry(
    async (ctx) => {
      const resp = await callAIGateway({
        model: ctx.usingFallback ? 'gpt-4o-mini' : 'claude-haiku-4-5',
        systemPrompt, userPrompt, maxTokens: 4096,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    null,
    AGENT_NAME, courseId, DEFAULT_RETRY_CONFIG
  )

  if (usedFallback) telemetry.fallbackActivated('claude_unavailable')

  const parsed    = parseJsonSafe<AnalyticsOutput>(rawOutput, {} as AnalyticsOutput)
  const validated = AnalyticsOutputSchema.safeParse({ ...parsed, course_id: courseId })

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Analytics validation: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('AnalyticsOutputSchema')

  // Upsert KPI metrics
  const kpiUpserts = Object.entries(output.kpi_snapshot).map(([metric, value]) =>
    serviceClient.rpc('upsert_analytics_metric', {
      p_course_id:   courseId,
      p_module_id:   null,
      p_lesson_id:   null,
      p_metric_name: metric,
      p_value:       Number(value),
      p_metadata:    { source: 'analytics_agent', is_pre_launch: isPreLaunch },
    })
  )
  await Promise.allSettled(kpiUpserts)
  telemetry.dbWrite('analytics_events', kpiUpserts.length)

  // Create analytics_tasks for threshold breaches
  for (const breach of output.threshold_breaches) {
    await serviceClient.from('analytics_tasks').insert({
      course_id:       courseId,
      metric_name:     breach.metric_name,
      actual_value:    breach.actual_value,
      threshold_value: breach.threshold_value,
      recommendation:  breach.recommendation,
      priority:        breach.priority,
      task_type:       'threshold_breach',
    })
  }
  if (output.threshold_breaches.length > 0) {
    telemetry.dbWrite('analytics_tasks', output.threshold_breaches.length)
  }

  // Store full report as digital asset
  await serviceClient.from('digital_assets').insert({
    course_id:   courseId,
    source_type: 'course',
    source_id:   courseId,
    asset_type:  'analytics_report',
    content:     output as unknown as Record<string, unknown>,
    is_active:   true,
    metadata:    { is_pre_launch: isPreLaunch },
  })
  telemetry.dbWrite('digital_assets', 1)

  const nextStatus = 'final_approval_gate'

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: nextStatus,
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      readiness_score:   output.overall_readiness_score,
      ready_to_publish:  output.ready_to_publish,
      threshold_breaches: output.threshold_breaches.length,
    },
  })
  telemetry.statusTransitioned('analytics_review', nextStatus)

  // Create final approval record
  const { data: approval } = await serviceClient
    .from('approvals')
    .insert({
      course_id:    courseId,
      gate_name:    'final_approval_gate',
      requested_by: AGENT_NAME,
      metadata: {
        readiness_score:  output.overall_readiness_score,
        ready_to_publish: output.ready_to_publish,
        kpi_snapshot:     output.kpi_snapshot,
      },
    })
    .select()
    .single()

  if (approval) telemetry.approvalCreated(approval.id, 'final_approval_gate')

  return {
    nextStatus,
    outputSummary: {
      readiness_score:   output.overall_readiness_score,
      ready_to_publish:  output.ready_to_publish,
      threshold_breaches: output.threshold_breaches.length,
      completion_rate:   output.kpi_snapshot.completion_rate,
      revenue_projection: output.revenue_projection_90d,
    },
  }
}
