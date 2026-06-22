import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { SalesPageOutputSchema, type SalesPageOutput } from '../../_shared/agentSchemas.ts'
import { salesPagePrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'sales_page_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export interface SalesPageInput {
  courseId: string
  userId:   string
  niche:    string
}

export async function runSalesPage(
  input:         SalesPageInput,
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  const [{ data: mrd }, { data: blueprint }, { data: course }] = await Promise.all([
    serviceClient.from('market_research_documents')
      .select('pricing_analysis, competitor_analysis, seo_keywords, risk_matrix')
      .eq('course_id', courseId).eq('is_active', true).maybeSingle(),
    serviceClient.from('course_blueprints')
      .select('id, core_framework, learning_outcomes, total_modules, total_lessons')
      .eq('course_id', courseId).eq('is_active', true).maybeSingle(),
    serviceClient.from('courses').select('price_usd, title').eq('id', courseId).single(),
  ])

  if (!mrd || !blueprint) throw normalizeError(new Error('Missing market research or blueprint'), { agentName: AGENT_NAME, courseId })

  // Build marketResearch context from actual columns
  const marketResearch: Record<string, unknown> = {
    competitor_analysis: mrd.competitor_analysis,
    top_keywords:        mrd.seo_keywords,
    pain_points:         Array.isArray(mrd.risk_matrix)
      ? (mrd.risk_matrix as Array<{ description: string }>).map(r => r.description)
      : [],
    ...(mrd.pricing_analysis as Record<string, unknown> ?? {}),
  }

  const bp = {
    learning_objectives: blueprint.learning_outcomes ?? [],
    total_modules:       blueprint.total_modules,
    total_lessons:       blueprint.total_lessons,
    ...(blueprint.core_framework as Record<string, unknown> ?? {}),
  }

  const priceUsd    = (course?.price_usd as number | null) ?? (marketResearch.recommended_price_usd as number | null) ?? 297
  const courseTitle = course?.title ?? niche

  const systemPrompt = salesPagePrompts.buildSystemPrompt()
  const userPrompt   = salesPagePrompts.buildUserPrompt({ niche, courseTitle, marketResearch, blueprint: bp, priceUsd })

  const { result: rawOutput, attempts, usedFallback } = await withRetry(
    async () => {
      const resp = await callAIGateway({
        model: 'llama-3.3-70b-versatile', systemPrompt, userPrompt, maxTokens: 6144,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    async () => {
      const resp = await callAIGateway({
        model: 'llama-3.1-8b-instant', systemPrompt, userPrompt, maxTokens: 6144,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    AGENT_NAME, courseId, DEFAULT_RETRY_CONFIG
  )

  if (usedFallback) telemetry.fallbackActivated('claude_unavailable')

  const parsed = parseJsonSafe<SalesPageOutput>(rawOutput, {} as SalesPageOutput)

  // Normalize cta_buttons — invalid positions + overlong text (weaker models overflow)
  const VALID_POSITIONS = new Set(['hero', 'mid_page', 'footer'])
  const clamp = (s: unknown, n: number) => typeof s === 'string' && s.length > n ? s.slice(0, n) : s
  if (Array.isArray(parsed?.cta_buttons)) {
    for (const btn of parsed.cta_buttons) {
      if (!VALID_POSITIONS.has(btn?.position as string)) btn.position = 'mid_page'
      btn.text = clamp(btn.text, 50) as string
      if (btn.subtext !== undefined) btn.subtext = clamp(btn.subtext, 100) as string
    }
  }

  // Clamp length-bounded string fields so weaker-model overflows don't fail validation
  if (parsed) {
    parsed.headline        = clamp(parsed.headline, 200) as string
    parsed.subheadline     = clamp(parsed.subheadline, 300) as string
    parsed.seo_title       = clamp(parsed.seo_title, 60) as string
    parsed.seo_description = clamp(parsed.seo_description, 160) as string
  }

  const validated = SalesPageOutputSchema.safeParse(parsed)

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Sales page validation failed: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('SalesPageOutputSchema')

  const { data: asset, error: assetErr } = await serviceClient
    .from('digital_assets')
    .insert({
      source_type:  'course',
      source_id:    courseId,
      asset_type:   'sales_copy',
      content_json: output as unknown as Record<string, unknown>,
      is_active:    true,
    })
    .select()
    .single()

  if (assetErr) throw normalizeError(assetErr, { agentName: AGENT_NAME, courseId })
  telemetry.dbWrite('digital_assets', 1)

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: 'sales_page_review',
    p_actor_id:   AGENT_NAME,
    p_metadata:   { asset_id: asset.id, headline: output.headline, price_usd: output.pricing_section.price_usd, attempts, used_fallback: usedFallback },
  })
  telemetry.statusTransitioned('sales_page_generation', 'sales_page_review')

  const { data: approval } = await serviceClient
    .from('approvals')
    .insert({
      course_id:      courseId,
      approval_stage: 'sales_page_review',
      target_type:    'sales_copy',
      target_id:      asset.id,
    })
    .select()
    .single()

  if (approval) telemetry.approvalCreated(approval.id, 'sales_page_review')

  return {
    nextStatus: 'sales_page_review',
    outputSummary: {
      headline:  output.headline,
      price_usd: output.pricing_section.price_usd,
      benefits:  output.benefits.length,
      faq_count: output.faq.length,
      asset_id:  asset.id,
      seo_title: output.seo_title,
    },
  }
}
