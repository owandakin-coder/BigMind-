import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { PublishingOutputSchema, type PublishingOutput } from '../../_shared/agentSchemas.ts'
import { publishingPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'publishing_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export async function runPublishing(
  input:         { courseId: string; userId: string; niche: string },
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  const [{ data: course }, { data: salesAsset }, { data: blueprint }, { data: mrd }] = await Promise.all([
    serviceClient.from('courses').select('title, target_niche').eq('id', courseId).single(),
    serviceClient.from('digital_assets').select('id').eq('source_id', courseId).eq('asset_type', 'sales_copy').eq('is_active', true).limit(1).maybeSingle(),
    serviceClient.from('course_blueprints').select('total_modules').eq('course_id', courseId).eq('is_active', true).maybeSingle(),
    serviceClient.from('market_research_documents').select('pricing_analysis').eq('course_id', courseId).eq('is_active', true).maybeSingle(),
  ])

  if (!course) throw normalizeError(new Error('Course not found'), { agentName: AGENT_NAME, courseId })

  const priceUsd = ((mrd?.pricing_analysis as Record<string, unknown> | null)?.recommended_price_usd as number | null) ?? 297

  const systemPrompt = publishingPrompts.buildSystemPrompt()
  const userPrompt   = publishingPrompts.buildUserPrompt({
    courseId,
    courseTitle: course.title,
    platforms:   ['gumroad', 'self_hosted'],
    priceUsd,
  })

  const { result: rawOutput, usedFallback } = await withRetry(
    async () => {
      const resp = await callAIGateway({
        model: 'llama-3.3-70b-versatile', systemPrompt, userPrompt, maxTokens: 4096,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    async () => {
      const resp = await callAIGateway({
        model: 'llama-3.1-8b-instant', systemPrompt, userPrompt, maxTokens: 4096,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    AGENT_NAME, courseId, DEFAULT_RETRY_CONFIG
  )

  if (usedFallback) telemetry.fallbackActivated('claude_unavailable')

  const parsed = parseJsonSafe<PublishingOutput>(rawOutput, {} as PublishingOutput)

  // Normalize enum fields — LLMs sometimes invent platform/status values
  const PUB_PLATFORMS = new Set(['teachable', 'thinkific', 'kajabi', 'udemy', 'gumroad', 'self_hosted'])
  const PUB_STATUSES  = new Set(['published', 'pending', 'failed'])
  if (Array.isArray(parsed?.platforms_published)) {
    for (const p of parsed.platforms_published) {
      if (!PUB_PLATFORMS.has(p?.platform as string)) p.platform = 'self_hosted'
      if (!PUB_STATUSES.has(p?.status as string)) p.status = 'published'
    }
  }

  const validated = PublishingOutputSchema.safeParse({ ...parsed, course_id: courseId })

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Publishing validation: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('PublishingOutputSchema')

  // Persist publishing report as workbook asset
  await serviceClient.from('digital_assets').insert({
    source_type:  'course',
    source_id:    courseId,
    asset_type:   'workbook',
    content_json: output as unknown as Record<string, unknown>,
    is_active:    true,
  })
  telemetry.dbWrite('digital_assets', 1)

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: 'live',
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      platforms_published: output.platforms_published?.length ?? 0,
      total_platforms:     output.total_platforms,
      successful_platforms: output.successful_platforms,
      has_sales_page:      !!salesAsset,
      module_count:        blueprint?.total_modules ?? 0,
    },
  })
  telemetry.statusTransitioned('publishing', 'live')

  return {
    nextStatus: 'live',
    outputSummary: {
      platforms_published:  output.platforms_published?.length ?? 0,
      successful_platforms: output.successful_platforms,
      total_platforms:      output.total_platforms,
      checklist_passed:     output.launch_checklist?.filter(c => c.completed).length ?? 0,
    },
  }
}
