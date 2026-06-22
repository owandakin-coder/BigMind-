/**
 * marketResearch.ts — Market Research Agent handler.
 *
 * Responsibilities:
 *  1. Fetch RAG context from market_embeddings
 *  2. Call AI with market research prompt
 *  3. Validate output against MarketResearchOutputSchema
 *  4. Persist to market_research_documents
 *  5. Generate & store embedding for the research
 *  6. Transition course status → market_review
 *  7. Create approval record at market_review gate
 *  8. Write agent_log entry
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, fetchRAGContext, generateEmbedding, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { MarketResearchOutputSchema, type MarketResearchOutput } from '../../_shared/agentSchemas.ts'
import { marketResearchPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME = 'market_research_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export interface MarketResearchInput {
  courseId:     string
  userId:       string
  niche:        string
  targetAudience?: string
  iteration?:   number
}

export async function runMarketResearch(
  input:         MarketResearchInput,
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche, targetAudience, iteration = 1 } = input

  // ── 1. Fetch RAG context ────────────────────────────────
  const ragContext = await fetchRAGContext(serviceClient, niche, 5)
  telemetry.dbWrite('market_embeddings', 5)

  // ── 2. Build prompts ────────────────────────────────────
  const systemPrompt = marketResearchPrompts.buildSystemPrompt()
  const userPrompt   = marketResearchPrompts.buildUserPrompt({
    niche, targetAudience, ragContext, iteration,
  })

  // ── 3. Call AI with retry ───────────────────────────────
  const { result: rawOutput, attempts, usedFallback } = await withRetry(
    async (_ctx) => {
      const response = await callAIGateway({
        model:        'llama-3.3-70b-versatile',
        systemPrompt,
        userPrompt,
        maxTokens:    4096,
        courseId,
        userId,
        agentName:    AGENT_NAME,
        creditCost:   CREDIT_COST,
        serviceClient,
      })
      return response.content
    },
    async (_ctx) => {
      const response = await callAIGateway({
        model:        'llama-3.1-8b-instant',
        systemPrompt,
        userPrompt,
        maxTokens:    4096,
        courseId,
        userId,
        agentName:    AGENT_NAME,
        creditCost:   CREDIT_COST,
        serviceClient,
      })
      return response.content
    },
    AGENT_NAME,
    courseId,
    DEFAULT_RETRY_CONFIG
  )

  if (usedFallback) telemetry.fallbackActivated('claude_unavailable')

  // ── 4. Parse and validate output ────────────────────────
  const parsed = parseJsonSafe<MarketResearchOutput>(rawOutput, {} as MarketResearchOutput)
  const validated = MarketResearchOutputSchema.safeParse(parsed)

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Validation failed: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  telemetry.validationPassed('MarketResearchOutputSchema')
  const output = validated.data

  // ── 5. Persist to market_research_documents ─────────────
  const { data: existingDoc } = await serviceClient
    .from('market_research_documents')
    .select('id')
    .eq('course_id', courseId)
    .eq('is_active', true)
    .maybeSingle()

  // Deactivate previous active doc (handled by trigger, but explicit for clarity)
  if (existingDoc) {
    await serviceClient
      .from('market_research_documents')
      .update({ is_active: false })
      .eq('id', existingDoc.id)
  }

  const { data: mrd, error: mrdError } = await serviceClient
    .from('market_research_documents')
    .insert({
      course_id:          courseId,
      demand_score:       output.demand_score,
      opportunity_score:  output.opportunity_score,
      pivot_triggered:    output.pivot_triggered,
      competitor_analysis: output.competitors,
      seo_keywords:       output.top_keywords,
      pivot_options:      output.pivot_options,
      pricing_analysis: {
        recommended_price_usd:  output.recommended_price_usd,
        price_sensitivity:      output.price_sensitivity,
        market_size:            output.market_size,
        target_audience:        output.target_audience,
        transformation_promise: output.transformation_promise,
        confidence_level:       output.confidence_level,
        iteration,
        attempts,
        used_fallback:          usedFallback,
        rag_used:               !!ragContext,
      },
      risk_matrix:        output.pain_points.map((p: string) => ({ description: p })),
      raw_llm_output:     rawOutput,
      is_active:          true,
      agent_version:      '1.0',
    })
    .select()
    .single()

  if (mrdError) throw normalizeError(mrdError, { agentName: AGENT_NAME, courseId })
  telemetry.dbWrite('market_research_documents', 1)

  // ── 6. Generate & store embedding for research content ──
  const embeddingText = [
    `Niche: ${niche}`,
    `Target audience: ${output.target_audience}`,
    `Pain points: ${output.pain_points.join(', ')}`,
    `Transformation: ${output.transformation_promise}`,
    `Keywords: ${output.top_keywords.join(', ')}`,
  ].join('\n')

  try {
    const embedding = await generateEmbedding(embeddingText)
    await serviceClient
      .from('market_embeddings')
      .upsert({
        niche,
        content_chunk: embeddingText,
        embedding,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        metadata: { course_id: courseId, demand_score: output.demand_score },
      }, { onConflict: 'niche,content_chunk' })
    telemetry.dbWrite('market_embeddings', 1)
  } catch (embeddingErr) {
    console.warn('[MarketResearch] Embedding generation failed (non-fatal):', embeddingErr)
  }

  // ── 7. Determine next status based on pivot logic ───────
  const nextStatus = output.pivot_triggered ? 'market_pivot' : 'market_review'

  // ── 8. Transition course status ─────────────────────────
  // Valid path: draft → market_research → market_review (or market_pivot)
  // Pre-transition to market_research is idempotent if already there
  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: 'market_research',
    p_actor_id:   AGENT_NAME,
    p_metadata:   {},
  })
  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: nextStatus,
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      demand_score:      output.demand_score,
      opportunity_score: output.opportunity_score,
      pivot_triggered:   output.pivot_triggered,
    },
  })
  telemetry.statusTransitioned(nextStatus === 'market_review' ? 'market_research' : 'market_research', nextStatus)

  // ── 9. Create approval record at HITL gate ──────────────
  if (nextStatus === 'market_review' || nextStatus === 'market_pivot') {
    const { data: approval } = await serviceClient
      .from('approvals')
      .insert({
        course_id:      courseId,
        approval_stage: nextStatus,
        target_type:    'market_report',
        target_id:      mrd.id,
      })
      .select()
      .single()

    if (approval) {
      telemetry.approvalCreated(approval.id, nextStatus === 'market_review' ? 'market_review' : 'pivot_review')
    }
  }

  const outputSummary = {
    demand_score:        output.demand_score,
    opportunity_score:   output.opportunity_score,
    pivot_triggered:     output.pivot_triggered,
    target_audience:     output.target_audience,
    top_keywords:        output.top_keywords.slice(0, 5),
    recommended_price:   output.recommended_price_usd,
    competitor_count:    output.competitors.length,
    mrd_id:              mrd.id,
  }

  return { nextStatus, outputSummary }
}
