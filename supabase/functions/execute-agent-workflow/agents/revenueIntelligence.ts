import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { RevenueIntelligenceOutputSchema, type RevenueIntelligenceOutput } from '../../_shared/agentSchemas.ts'
import { revenueIntelligencePrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'revenue_intelligence_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export async function runRevenueIntelligence(
  input:         { courseId: string; userId: string; niche: string },
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  // Load revenue events for this course
  const { data: revenueEvents } = await serviceClient
    .from('revenue_events')
    .select('*')
    .eq('course_id', courseId)
    .order('occurred_at', { ascending: true })

  // Load analytics data
  const { data: analyticsData } = await serviceClient
    .from('analytics_events')
    .select('event_type, event_value, metadata, created_at')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(300)

  const { data: course } = await serviceClient
    .from('courses')
    .select('price_usd, title, published_at')
    .eq('id', courseId)
    .single()

  // Compute revenue summary for prompt context
  const totalRevenue = (revenueEvents ?? []).reduce((s, e) => s + Number(e.amount_usd), 0)
  const totalTransactions = (revenueEvents ?? []).length
  const avgOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

  const systemPrompt = revenueIntelligencePrompts.buildSystemPrompt()
  const userPrompt   = revenueIntelligencePrompts.buildUserPrompt({
    courseId,
    niche,
    courseTitle:     course?.title ?? niche,
    priceUsd:        course?.price_usd ?? 297,
    publishedAt:     course?.published_at ?? null,
    totalRevenue,
    totalTransactions,
    avgOrderValue,
    revenueEvents:   (revenueEvents ?? []).slice(-100), // last 100 events for context
    analyticsData:   analyticsData ?? [],
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

  const parsed    = parseJsonSafe<RevenueIntelligenceOutput>(rawOutput, {} as RevenueIntelligenceOutput)
  const validated = RevenueIntelligenceOutputSchema.safeParse({ ...parsed, course_id: courseId })

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Revenue intelligence validation: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('RevenueIntelligenceOutputSchema')

  // Insert revenue_events for each revenue lever identified
  const leverEvents = output.revenue_levers.map(lever => ({
    course_id:   courseId,
    event_type:  'revenue_lever_identified',
    amount_usd:  lever.projected_revenue_impact,
    metadata:    {
      lever_name:   lever.lever_name,
      priority:     lever.priority,
      action:       lever.action,
      timeframe:    lever.timeframe,
    },
    occurred_at: new Date().toISOString(),
  }))

  if (leverEvents.length > 0) {
    await serviceClient.from('revenue_events').insert(leverEvents)
    telemetry.dbWrite('revenue_events', leverEvents.length)
  }

  // Insert churn risk events
  const churnEvents = output.churn_risks
    .filter(r => r.risk_level === 'high' || r.risk_level === 'critical')
    .map(risk => ({
      course_id:   courseId,
      event_type:  'churn_risk_detected',
      amount_usd:  risk.revenue_at_risk,
      metadata:    {
        segment:    risk.segment,
        risk_level: risk.risk_level,
        indicators: risk.indicators,
        action:     risk.recommended_action,
      },
      occurred_at: new Date().toISOString(),
    }))

  if (churnEvents.length > 0) {
    await serviceClient.from('revenue_events').insert(churnEvents)
    telemetry.dbWrite('revenue_events', churnEvents.length)
  }

  // Persist full report as digital asset
  await serviceClient.from('digital_assets').insert({
    course_id:   courseId,
    source_type: 'course',
    source_id:   courseId,
    asset_type:  'revenue_intelligence_report',
    content:     output as unknown as Record<string, unknown>,
    is_active:   true,
    metadata:    { total_revenue: totalRevenue, total_transactions: totalTransactions },
  })
  telemetry.dbWrite('digital_assets', 1)

  const nextStatus = 'revenue_analysis'

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: nextStatus,
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      mrr_current:       output.revenue_summary.mrr_current,
      forecast_90d:      output.forecasts.revenue_90d,
      churn_risks_high:  churnEvents.length,
      revenue_levers:    output.revenue_levers.length,
    },
  })
  telemetry.statusTransitioned('portfolio_sync', nextStatus)

  return {
    nextStatus,
    outputSummary: {
      mrr_current:      output.revenue_summary.mrr_current,
      revenue_90d:      output.forecasts.revenue_90d,
      revenue_levers:   output.revenue_levers.length,
      churn_risks_high: churnEvents.length,
      pricing_experiments: output.pricing_experiments.length,
    },
  }
}
