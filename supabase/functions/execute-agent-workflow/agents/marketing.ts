import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { MarketingOutputSchema, type MarketingOutput } from '../../_shared/agentSchemas.ts'
import { marketingPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'marketing_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export async function runMarketing(
  input:         { courseId: string; userId: string; niche: string },
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  const [{ data: mrd }, { data: course }] = await Promise.all([
    serviceClient.from('market_research_documents')
      .select('pricing_analysis, seo_keywords, risk_matrix')
      .eq('course_id', courseId).eq('is_active', true).maybeSingle(),
    serviceClient.from('courses').select('title, price_usd').eq('id', courseId).single(),
  ])

  if (!mrd) throw normalizeError(new Error('No market research document'), { agentName: AGENT_NAME, courseId })

  const pricing = (mrd.pricing_analysis as Record<string, unknown> ?? {})
  const mr: Record<string, unknown> = {
    target_audience:       pricing.target_audience ?? '',
    transformation_promise: pricing.transformation_promise ?? '',
    top_keywords:          mrd.seo_keywords ?? [],
    ...pricing,
  }

  const systemPrompt = marketingPrompts.buildSystemPrompt()
  const userPrompt   = marketingPrompts.buildUserPrompt({
    niche,
    courseTitle:           course?.title ?? niche,
    targetAudience:        String(mr.target_audience ?? ''),
    transformationPromise: String(mr.transformation_promise ?? ''),
    topKeywords:           (mr.top_keywords as string[] | null) ?? [],
    priceUsd:              (course?.price_usd as number | null) ?? 297,
  })

  const { result: rawOutput, usedFallback } = await withRetry(
    async () => {
      const resp = await callAIGateway({
        model: 'llama-3.3-70b-versatile', systemPrompt, userPrompt, maxTokens: 8192,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    async () => {
      const resp = await callAIGateway({
        model: 'llama-3.1-8b-instant', systemPrompt, userPrompt, maxTokens: 8192,
        courseId, userId, agentName: AGENT_NAME, creditCost: CREDIT_COST, serviceClient,
      })
      return resp.content
    },
    AGENT_NAME, courseId, DEFAULT_RETRY_CONFIG
  )

  if (usedFallback) telemetry.fallbackActivated('claude_unavailable')

  const parsed = parseJsonSafe<MarketingOutput>(rawOutput, {} as MarketingOutput)

  // Normalize enum fields + clamp tight string lengths (weaker models overflow)
  const VIDEO_PLATFORMS = new Set(['tiktok', 'instagram_reels', 'youtube_shorts'])
  const AD_PLATFORMS    = new Set(['facebook', 'google', 'instagram', 'youtube'])
  const clamp = (s: unknown, n: number) => typeof s === 'string' && s.length > n ? s.slice(0, n) : s
  if (Array.isArray(parsed?.twitter_threads)) {
    for (const t of parsed.twitter_threads) {
      t.hook = clamp(t.hook, 280) as string
      t.cta  = clamp(t.cta, 280) as string
      if (Array.isArray(t.tweets)) t.tweets = t.tweets.map((x: string) => clamp(x, 280) as string)
    }
  }
  if (parsed?.linkedin_carousel) {
    parsed.linkedin_carousel.title = clamp(parsed.linkedin_carousel.title, 150) as string
    if (Array.isArray(parsed.linkedin_carousel.slides)) {
      for (const s of parsed.linkedin_carousel.slides) {
        s.headline = clamp(s.headline, 100) as string
        s.body     = clamp(s.body, 300) as string
      }
    }
  }
  if (Array.isArray(parsed?.short_form_video_scripts)) {
    for (const v of parsed.short_form_video_scripts) {
      if (!VIDEO_PLATFORMS.has(v?.platform as string)) v.platform = 'tiktok'
      v.hook = clamp(v.hook, 150) as string
      v.body = clamp(v.body, 500) as string
      v.cta  = clamp(v.cta, 100) as string
    }
  }
  if (parsed?.newsletter_intro) {
    parsed.newsletter_intro.subject_line = clamp(parsed.newsletter_intro.subject_line, 80) as string
    parsed.newsletter_intro.preview_text = clamp(parsed.newsletter_intro.preview_text, 100) as string
    parsed.newsletter_intro.body         = clamp(parsed.newsletter_intro.body, 1000) as string
  }
  if (Array.isArray(parsed?.email_sequence)) {
    for (const e of parsed.email_sequence) {
      e.subject = clamp(e.subject, 80) as string
      e.preview = clamp(e.preview, 100) as string
    }
  }
  if (Array.isArray(parsed?.ad_copy)) {
    for (const a of parsed.ad_copy) {
      if (!AD_PLATFORMS.has(a?.platform as string)) a.platform = 'facebook'
      a.headline    = clamp(a.headline, 40) as string
      a.description = clamp(a.description, 125) as string
      a.cta_button  = clamp(a.cta_button, 20) as string
    }
  }

  const validated = MarketingOutputSchema.safeParse({ ...parsed, course_id: courseId })
  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
  }

  // Best-effort: marketing assets are supplementary — a schema miss must never
  // hard-fail the whole course. Use validated data when possible, else fall back
  // to the clamped raw output with safe defaults for any missing field.
  const output = (validated.success ? validated.data : {
    twitter_threads:          Array.isArray(parsed?.twitter_threads) ? parsed.twitter_threads : [],
    linkedin_carousel:        parsed?.linkedin_carousel ?? { title: '', slides: [], cover_image_prompt: '' },
    short_form_video_scripts: Array.isArray(parsed?.short_form_video_scripts) ? parsed.short_form_video_scripts : [],
    newsletter_intro:         parsed?.newsletter_intro ?? { subject_line: '', preview_text: '', body: '' },
    email_sequence:           Array.isArray(parsed?.email_sequence) ? parsed.email_sequence : [],
    ad_copy:                  Array.isArray(parsed?.ad_copy) ? parsed.ad_copy : [],
    content_calendar:         Array.isArray(parsed?.content_calendar) ? parsed.content_calendar : [],
  }) as MarketingOutput

  // Persist as multiple digital assets — map to valid asset_type ENUM values
  const assetInserts = [
    { asset_type: 'social_post',    content_json: { type: 'twitter_threads',   data: output.twitter_threads } },
    { asset_type: 'social_post',    content_json: { type: 'linkedin_carousel', data: output.linkedin_carousel } },
    { asset_type: 'video_script',   content_json: { type: 'video_scripts',     data: output.short_form_video_scripts } },
    { asset_type: 'email_sequence', content_json: { type: 'newsletter',        data: output.newsletter_intro } },
    { asset_type: 'email_sequence', content_json: { type: 'email_sequence',    data: output.email_sequence } },
    { asset_type: 'sales_copy',     content_json: { type: 'ad_copy',           data: output.ad_copy } },
    { asset_type: 'social_post',    content_json: { type: 'content_calendar',  data: output.content_calendar } },
  ].map(a => ({
    source_type:  'course',
    source_id:    courseId,
    asset_type:   a.asset_type,
    content_json: a.content_json as unknown as Record<string, unknown>,
    is_active:    true,
  }))

  const { error: assetsErr } = await serviceClient.from('digital_assets').insert(assetInserts)
  if (!assetsErr) telemetry.dbWrite('digital_assets', assetInserts.length)

  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: 'marketing_review',
    p_actor_id:   AGENT_NAME,
    p_metadata:   { assets_created: assetInserts.length, content_calendar_days: output.content_calendar.length },
  })
  telemetry.statusTransitioned('marketing_prep', 'marketing_review')

  const { data: approval } = await serviceClient
    .from('approvals')
    .insert({
      course_id:      courseId,
      approval_stage: 'marketing_review',
      target_type:    'full_course',
      target_id:      courseId,
    })
    .select()
    .single()

  if (approval) telemetry.approvalCreated(approval.id, 'marketing_review')

  return {
    nextStatus: 'marketing_review',
    outputSummary: {
      twitter_threads:  output.twitter_threads.length,
      email_sequence:   output.email_sequence.length,
      ad_copies:        output.ad_copy.length,
      content_calendar: output.content_calendar.length,
      assets_created:   assetInserts.length,
    },
  }
}
