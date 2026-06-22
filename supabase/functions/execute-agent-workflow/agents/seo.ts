import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { SEOOutputSchema, type SEOOutput } from '../../_shared/agentSchemas.ts'
import { seoPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'seo_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export async function runSEO(
  input:         { courseId: string; userId: string; niche: string },
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  const [{ data: course }, { data: mrd }, { data: salesPage }] = await Promise.all([
    serviceClient.from('courses').select('title, price_usd, published_at').eq('id', courseId).single(),
    serviceClient.from('market_research_documents').select('content').eq('course_id', courseId).eq('is_active', true).maybeSingle(),
    serviceClient.from('digital_assets').select('content').eq('course_id', courseId).eq('asset_type', 'sales_page').eq('is_active', true).maybeSingle(),
  ])

  const marketResearch = (mrd?.content ?? {}) as Record<string, unknown>
  const salesContent   = (salesPage?.content ?? {}) as Record<string, unknown>

  const systemPrompt = seoPrompts.buildSystemPrompt()
  const userPrompt   = seoPrompts.buildUserPrompt({
    courseId,
    niche,
    courseTitle:   course?.title ?? niche,
    priceUsd:      course?.price_usd ?? 297,
    targetAudience: String(marketResearch.target_audience ?? ''),
    painPoints:    (marketResearch.pain_points as string[] | null) ?? [],
    topKeywords:   (marketResearch.top_keywords as string[] | null) ?? [],
    salesHeadline: String(salesContent.headline ?? ''),
  })

  const { result: rawOutput, usedFallback } = await withRetry(
    async (ctx) => {
      const resp = await callAIGateway({
        model: ctx.usingFallback ? 'gpt-4o' : 'claude-sonnet-4-6',
        systemPrompt, userPrompt, maxTokens: 4096,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    async () => {
      const resp = await callAIGateway({
        model: 'gpt-4o', systemPrompt, userPrompt, maxTokens: 4096,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    AGENT_NAME, courseId, DEFAULT_RETRY_CONFIG
  )

  if (usedFallback) telemetry.fallbackActivated('claude_unavailable')

  const parsed    = parseJsonSafe<SEOOutput>(rawOutput, {} as SEOOutput)
  const validated = SEOOutputSchema.safeParse({ ...parsed, course_id: courseId })

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`SEO validation: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('SEOOutputSchema')

  // Upsert seo_metadata
  const { error: seoErr } = await serviceClient
    .from('seo_metadata')
    .upsert({
      course_id:        courseId,
      primary_keyword:  output.primary_keyword,
      secondary_keywords: output.secondary_keywords,
      meta_title:       output.meta_title,
      meta_description: output.meta_description,
      slug:             output.slug,
      schema_markup:    output.schema_markup,
      target_keywords:  output.target_keywords,
      search_intent:    output.search_intent,
      estimated_monthly_searches: output.estimated_monthly_searches,
      keyword_difficulty: output.keyword_difficulty,
      content_gap_analysis: output.content_gap_analysis,
      metadata:         { agent_run: new Date().toISOString() },
    }, { onConflict: 'course_id' })

  if (!seoErr) telemetry.dbWrite('seo_metadata', 1)

  // Create content optimization tasks
  if (output.content_optimization.length > 0) {
    const optimizationTasks = output.content_optimization.map(item => ({
      course_id:       courseId,
      metric_name:     'seo_optimization',
      actual_value:    item.current_score,
      threshold_value: item.target_score,
      recommendation:  item.recommendation,
      priority:        item.priority,
      task_type:       'seo_optimization',
    }))

    await serviceClient.from('analytics_tasks').insert(optimizationTasks)
    telemetry.dbWrite('analytics_tasks', optimizationTasks.length)
  }

  // Persist full SEO report
  await serviceClient.from('digital_assets').insert({
    course_id:   courseId,
    source_type: 'course',
    source_id:   courseId,
    asset_type:  'seo_report',
    content:     output as unknown as Record<string, unknown>,
    is_active:   true,
    metadata:    { primary_keyword: output.primary_keyword },
  })
  telemetry.dbWrite('digital_assets', 1)

  const nextStatus = 'seo_optimization'

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: nextStatus,
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      primary_keyword:    output.primary_keyword,
      monthly_searches:   output.estimated_monthly_searches,
      keyword_difficulty: output.keyword_difficulty,
      slug:               output.slug,
    },
  })
  telemetry.statusTransitioned('revenue_analysis', nextStatus)

  return {
    nextStatus,
    outputSummary: {
      primary_keyword:        output.primary_keyword,
      monthly_searches:       output.estimated_monthly_searches,
      keyword_difficulty:     output.keyword_difficulty,
      slug:                   output.slug,
      content_optimizations:  output.content_optimization.length,
      backlink_targets:       output.backlink_strategy.length,
    },
  }
}
