/**
 * courseArchitect.ts — Course Architect Agent handler.
 *
 * Responsibilities:
 *  1. Load active market research doc for context
 *  2. Call AI with architecture prompt
 *  3. Validate output against CourseArchitectOutputSchema
 *  4. Persist to course_blueprints
 *  5. Create modules + lessons records in DB
 *  6. Transition → architecture_review
 *  7. Create approval record
 *  8. Write agent_log
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import { CourseArchitectOutputSchema, type CourseArchitectOutput } from '../../_shared/agentSchemas.ts'
import { courseArchitectPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'course_architect_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export interface CourseArchitectInput {
  courseId: string
  userId:   string
  niche:    string
}

export async function runCourseArchitect(
  input:         CourseArchitectInput,
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche } = input

  // ── 1. Load market research context ─────────────────────
  const { data: mrd } = await serviceClient
    .from('market_research_documents')
    .select('id, demand_score, opportunity_score, competitor_analysis, seo_keywords, pivot_options, pricing_analysis, risk_matrix, pivot_triggered')
    .eq('course_id', courseId)
    .eq('is_active', true)
    .maybeSingle()

  if (!mrd) throw normalizeError(new Error('No active market research document found'), { agentName: AGENT_NAME, courseId })

  // Build a context object from the normalised MRD columns
  const marketResearch: Record<string, unknown> = {
    demand_score:        mrd.demand_score,
    opportunity_score:   mrd.opportunity_score,
    competitor_analysis: mrd.competitor_analysis,
    top_keywords:        mrd.seo_keywords,
    pivot_options:       mrd.pivot_options,
    risk_matrix:         mrd.risk_matrix,
    pain_points:         Array.isArray(mrd.risk_matrix)
      ? (mrd.risk_matrix as Array<{ description: string }>).map(r => r.description)
      : [],
    // Flatten pricing_analysis JSONB (recommended_price_usd, target_audience, etc.)
    ...(mrd.pricing_analysis as Record<string, unknown> ?? {}),
  }

  // Load course price from courses table
  const { data: course } = await serviceClient
    .from('courses')
    .select('price_usd')
    .eq('id', courseId)
    .single()
  const targetPrice = (course?.price_usd as number | null) ?? (marketResearch.recommended_price_usd as number | null) ?? 297

  // ── 2. Build prompts ────────────────────────────────────
  const systemPrompt = courseArchitectPrompts.buildSystemPrompt()
  const userPrompt   = courseArchitectPrompts.buildUserPrompt({ niche, marketResearch, targetPrice })

  // ── 3. Call AI with retry ───────────────────────────────
  const { result: rawOutput, attempts, usedFallback } = await withRetry(
    async (_ctx) => {
      const resp = await callAIGateway({
        model:     'llama-3.3-70b-versatile',
        systemPrompt, userPrompt, maxTokens: 8192,
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

  // ── 4. Parse and validate ────────────────────────────────
  const parsed = parseJsonSafe<CourseArchitectOutput>(rawOutput, {} as CourseArchitectOutput)

  // Normalize content_types — LLMs sometimes return non-enum values
  const VALID_CONTENT_TYPES = new Set(['video', 'text', 'quiz', 'worksheet', 'live_demo', 'case_study'])
  if (Array.isArray(parsed?.modules)) {
    for (const mod of parsed.modules) {
      if (Array.isArray(mod?.lessons)) {
        for (const les of mod.lessons) {
          if (Array.isArray(les.content_types)) {
            les.content_types = les.content_types.filter((v: string) => VALID_CONTENT_TYPES.has(v))
            if (!les.content_types.length) les.content_types = ['video']
          }
        }
      }
    }
  }

  const validated = CourseArchitectOutputSchema.safeParse(parsed)

  if (!validated.success) {
    telemetry.validationFailed(validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`))
    throw normalizeError(new Error(`Architect validation failed: ${validated.error.message}`), { agentName: AGENT_NAME, courseId })
  }

  const output = validated.data
  telemetry.validationPassed('CourseArchitectOutputSchema')

  // ── 5. Persist blueprint ─────────────────────────────────
  const { data: blueprint, error: bpError } = await serviceClient
    .from('course_blueprints')
    .insert({
      course_id:         courseId,
      market_report_id:  mrd.id,
      core_framework:    output as unknown as Record<string, unknown>,
      learning_outcomes: output.learning_objectives,
      total_modules:     output.modules.length,
      total_lessons:     output.total_lessons,
      estimated_hours:   output.total_hours,
      is_active:         true,
    })
    .select()
    .single()

  if (bpError) throw normalizeError(bpError, { agentName: AGENT_NAME, courseId })
  telemetry.dbWrite('course_blueprints', 1)

  // ── 6. Persist modules + lessons ────────────────────────
  let totalLessonsCreated = 0
  for (let mi = 0; mi < output.modules.length; mi++) {
    const mod = output.modules[mi]

    const { data: moduleRecord, error: modErr } = await serviceClient
      .from('modules')
      .insert({
        course_id:    courseId,
        blueprint_id: blueprint.id,
        title:        mod.title,
        sort_order:   mi,
        description:  mod.learning_outcome,
        is_mvc:       mod.is_mvc,
      })
      .select()
      .single()

    if (modErr) {
      console.warn(`[CourseArchitect] Failed to insert module ${mi}: ${modErr.message}`)
      continue
    }

    // Insert lessons for this module
    const lessonInserts = mod.lessons.map((les, li) => ({
      module_id:           moduleRecord.id,
      course_id:           courseId,
      title:               les.title,
      sort_order:          li,
      context_hook:        les.hook,
      observation_concept: les.observation,
      reflection_exercise: les.reflection,
      estimated_minutes:   les.estimated_minutes,
    }))

    const { data: lessonRows, error: lesErr } = await serviceClient
      .from('lessons')
      .insert(lessonInserts)
      .select()

    if (!lesErr && lessonRows) totalLessonsCreated += lessonRows.length
  }

  telemetry.dbWrite('modules', output.modules.length)
  telemetry.dbWrite('lessons', totalLessonsCreated)

  // ── 7. Transition status ────────────────────────────────
  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: 'architecture_review',
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      blueprint_id:    blueprint.id,
      total_modules:   output.modules.length,
      total_lessons:   totalLessonsCreated,
      total_hours:     output.total_hours,
      mvc_modules:     output.modules.filter(m => m.is_mvc).length,
    },
  })
  telemetry.statusTransitioned('course_architecture', 'architecture_review')

  // ── 8. Create approval record ───────────────────────────
  const { data: approval } = await serviceClient
    .from('approvals')
    .insert({
      course_id:      courseId,
      approval_stage: 'architecture_review',
      target_type:    'blueprint',
      target_id:      blueprint.id,
    })
    .select()
    .single()

  if (approval) telemetry.approvalCreated(approval.id, 'architecture_review')

  return {
    nextStatus: 'architecture_review',
    outputSummary: {
      blueprint_id:  blueprint.id,
      course_title:  output.course_title,
      total_modules: output.modules.length,
      total_lessons: totalLessonsCreated,
      total_hours:   output.total_hours,
      mvc_modules:   output.modules.filter(m => m.is_mvc).length,
    },
  }
}
