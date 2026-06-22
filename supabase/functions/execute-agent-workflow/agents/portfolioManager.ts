import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { PortfolioManagerOutputSchema, type PortfolioManagerOutput } from '../../_shared/agentSchemas.ts'
import { portfolioManagerPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'portfolio_manager_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export async function runPortfolioManager(
  input:         { courseId: string; userId: string; niche: string },
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  // Load all published courses for this user
  const { data: userCourses } = await serviceClient
    .from('courses')
    .select('id, title, niche, price_usd, status, published_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'published')

  // Load existing portfolio_courses data
  const { data: portfolioData } = await serviceClient
    .from('portfolio_courses')
    .select('*')
    .in('course_id', (userCourses ?? []).map(c => c.id))

  // Load revenue events for context
  const { data: revenueEvents } = await serviceClient
    .from('revenue_events')
    .select('course_id, event_type, amount_usd, occurred_at')
    .in('course_id', (userCourses ?? []).map(c => c.id))
    .order('occurred_at', { ascending: false })
    .limit(500)

  const revenueByCourseid = (revenueEvents ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.course_id] = (acc[e.course_id] ?? 0) + Number(e.amount_usd)
    return acc
  }, {})

  const portfolioContext = (userCourses ?? []).map(c => ({
    ...c,
    total_revenue: revenueByCourseid[c.id] ?? 0,
    portfolio: portfolioData?.find(p => p.course_id === c.id) ?? null,
  }))

  const systemPrompt = portfolioManagerPrompts.buildSystemPrompt()
  const userPrompt   = portfolioManagerPrompts.buildUserPrompt({
    currentCourseId: courseId,
    niche,
    portfolio:       portfolioContext,
    totalCourses:    portfolioContext.length,
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

  const parsed    = parseJsonSafe<PortfolioManagerOutput>(rawOutput, {} as PortfolioManagerOutput)
  const validated = PortfolioManagerOutputSchema.safeParse({ ...parsed, course_id: courseId })

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Portfolio validation: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('PortfolioManagerOutputSchema')

  // Upsert portfolio_courses records for each analyzed course
  for (const analysis of output.course_analyses) {
    await serviceClient
      .from('portfolio_courses')
      .upsert({
        course_id:         analysis.course_id,
        user_id:           userId,
        bcg_quadrant:      analysis.bcg_quadrant,
        growth_rate:       analysis.growth_rate,
        market_share:      analysis.market_share,
        portfolio_score:   analysis.portfolio_score,
        recommended_price: analysis.recommended_price,
        action:            analysis.action,
        metadata:          { agent_run: new Date().toISOString() },
      }, { onConflict: 'course_id' })
  }
  telemetry.dbWrite('portfolio_courses', output.course_analyses.length)

  // Persist portfolio report as digital asset
  await serviceClient.from('digital_assets').insert({
    course_id:   courseId,
    source_type: 'course',
    source_id:   courseId,
    asset_type:  'portfolio_report',
    content:     output as unknown as Record<string, unknown>,
    is_active:   true,
    metadata:    { courses_analyzed: output.course_analyses.length },
  })
  telemetry.dbWrite('digital_assets', 1)

  const nextStatus = 'portfolio_sync'

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: nextStatus,
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      courses_analyzed:     output.course_analyses.length,
      cross_sell_count:     output.cross_sell_opportunities.length,
      gap_courses_found:    output.gap_courses.length,
    },
  })
  telemetry.statusTransitioned('published', nextStatus)

  return {
    nextStatus,
    outputSummary: {
      courses_analyzed:  output.course_analyses.length,
      cross_sell_count:  output.cross_sell_opportunities.length,
      gap_courses:       output.gap_courses.length,
      portfolio_summary: output.portfolio_summary,
    },
  }
}
