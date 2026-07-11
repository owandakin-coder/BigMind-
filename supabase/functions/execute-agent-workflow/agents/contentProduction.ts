/**
 * contentProduction.ts — Content Production Agent handler.
 *
 * Each lesson generates all 3 asset types (written, visual, interactive) via a
 * SINGLE combined llama-3.3-70b call (8b fallback), then validates each stream
 * independently. One call per lesson avoids the 8b rate-limit starvation that
 * used to drop the visual/interactive assets. MVC lessons are processed first.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'
import { callAIGateway, parseJsonSafe } from '../../_shared/aiGateway.ts'
import {
  WrittenContentOutputSchema,
  VisualContentOutputSchema,
  InteractiveContentOutputSchema,
} from '../../_shared/agentSchemas.ts'
import { contentProductionPrompts } from '../../_shared/promptRegistry.ts'
import { withRetry, DEFAULT_RETRY_CONFIG } from '../../_shared/retryManager.ts'
import { normalizeError } from '../../_shared/errorNormalizer.ts'
import { TelemetryCollector } from '../../_shared/telemetry.ts'
import { AGENT_CREDIT_COST } from '../../_shared/costEstimator.ts'

const AGENT_NAME  = 'content_production_agent'
const CREDIT_COST = AGENT_CREDIT_COST[AGENT_NAME]

export interface ContentProductionInput {
  courseId: string
  userId:   string
  niche:    string
  mvcOnly?: boolean  // If true, only build MVC lessons
}

export async function runContentProduction(
  input:         ContentProductionInput,
  serviceClient: SupabaseClient,
  telemetry:     TelemetryCollector
): Promise<{ nextStatus: string; outputSummary: Record<string, unknown> }> {

  const { courseId, userId, niche, mvcOnly = false } = input

  // ── 1. Load lessons from DB ─────────────────────────────
  const { data: lessons, error: lessonsErr } = await serviceClient
    .from('lessons')
    .select('*, modules!inner(title, is_mvc)')
    .eq('course_id', courseId)
    .order('sort_order')

  if (lessonsErr) throw normalizeError(lessonsErr, { agentName: AGENT_NAME, courseId })
  if (!lessons?.length) throw normalizeError(new Error('No lessons found to produce content for'), { agentName: AGENT_NAME, courseId })

  // Sort: MVC lessons (from mvc modules) first; apply mvcOnly filter in JS
  type ModuleData = { title: string; is_mvc: boolean }
  const allLessons = lessons.filter(l => !mvcOnly || (l.modules as unknown as ModuleData).is_mvc)
  if (!allLessons.length) throw normalizeError(new Error('No MVC lessons found'), { agentName: AGENT_NAME, courseId })

  const sortedLessons = [...allLessons].sort((a, b) => {
    const aMvc = (a.modules as unknown as ModuleData).is_mvc
    const bMvc = (b.modules as unknown as ModuleData).is_mvc
    if (aMvc && !bMvc) return -1
    if (!aMvc && bMvc) return 1
    return 0
  })

  telemetry.dbWrite('lessons', sortedLessons.length)

  const systemCombined = contentProductionPrompts.buildCombinedSystemPrompt()

  let totalAssets = 0

  // Streams each lesson already has — so re-runs are idempotent (skip covered
  // streams, no duplicate assets, no wasted rate-limit budget).
  const done = { written: new Set<string>(), visual: new Set<string>(), interactive: new Set<string>() }
  {
    const { data: priorAssets } = await serviceClient
      .from('digital_assets')
      .select('asset_type, source_id')
      .in('source_id', sortedLessons.map(l => l.id))
    for (const a of priorAssets ?? []) {
      const sid = a.source_id as string
      if (a.asset_type === 'lesson_script') done.written.add(sid)
      else if (a.asset_type === 'slide_outline') done.visual.add(sid)
      else if (a.asset_type === 'quiz_json') done.interactive.add(sid)
    }
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  // Generate only the streams a lesson is still missing. Returns true once the
  // lesson has written content. One combined 70b call (8b fallback) per lesson.
  const produceLesson = async (lesson: { id: string; title: string; context_hook: string | null; modules: unknown }): Promise<boolean> => {
    const needWritten     = !done.written.has(lesson.id)
    const needVisual      = !done.visual.has(lesson.id)
    const needInteractive = !done.interactive.has(lesson.id)
    if (!needWritten && !needVisual && !needInteractive) return true

    const modData = lesson.modules as unknown as ModuleData
    const userPrompt = contentProductionPrompts.buildCombinedUserPrompt({
      lessonTitle: lesson.title,
      coreConcept: lesson.context_hook ?? '',
      hook:        lesson.context_hook ?? '',
      niche,
      moduleTitle: modData.title,
      isMVC:       modData.is_mvc,
    })

    let combined: { result: string } | null = null
    try {
      combined = await withRetry(
        async () => {
          const resp = await callAIGateway({ model: 'llama-3.3-70b-versatile', systemPrompt: systemCombined, userPrompt, maxTokens: 4096, courseId, userId, agentName: AGENT_NAME, creditCost: 0, serviceClient })
          return resp.content
        },
        async () => {
          const resp = await callAIGateway({ model: 'llama-3.1-8b-instant', systemPrompt: systemCombined, userPrompt, maxTokens: 4096, courseId, userId, agentName: AGENT_NAME, creditCost: 0, serviceClient })
          return resp.content
        },
        AGENT_NAME, courseId, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 }
      ) as { result: string }
    } catch {
      combined = null
    }
    if (!combined) return done.written.has(lesson.id)

    const parsed = parseJsonSafe(combined.result, {}) as Record<string, unknown>
    const assetInserts: Array<{ source_type: string; source_id: string; asset_type: string; content_json: Record<string, unknown>; is_active: boolean }> = []

    if (needWritten) {
      const wValid = WrittenContentOutputSchema.safeParse({ ...(parsed.written as Record<string, unknown> ?? {}), lesson_id: lesson.id })
      if (wValid.success) { assetInserts.push({ source_type: 'lesson', source_id: lesson.id, asset_type: 'lesson_script', content_json: wValid.data as unknown as Record<string, unknown>, is_active: true }); done.written.add(lesson.id) }
      else telemetry.validationFailed([`Written content for lesson ${lesson.id}: ${wValid.error.message}`])
    }
    if (needVisual) {
      const vValid = VisualContentOutputSchema.safeParse({ ...(parsed.visual as Record<string, unknown> ?? {}), lesson_id: lesson.id })
      if (vValid.success) { assetInserts.push({ source_type: 'lesson', source_id: lesson.id, asset_type: 'slide_outline', content_json: vValid.data as unknown as Record<string, unknown>, is_active: true }); done.visual.add(lesson.id) }
    }
    if (needInteractive) {
      const iValid = InteractiveContentOutputSchema.safeParse({ ...(parsed.interactive as Record<string, unknown> ?? {}), lesson_id: lesson.id })
      if (iValid.success) { assetInserts.push({ source_type: 'lesson', source_id: lesson.id, asset_type: 'quiz_json', content_json: iValid.data as unknown as Record<string, unknown>, is_active: true }); done.interactive.add(lesson.id) }
    }

    if (assetInserts.length > 0) {
      const { error: assetErr } = await serviceClient.from('digital_assets').insert(assetInserts)
      if (!assetErr) totalAssets += assetInserts.length
    }
    return done.written.has(lesson.id)
  }

  // ── 2. Pass 1 — every lesson, throttled to stay under the rate limit ──
  for (const lesson of sortedLessons) {
    await produceLesson(lesson)
    await sleep(2500)
  }

  // ── 2b. Pass 2 — retry lessons still missing written content after a
  // pause so Groq's per-minute rate-limit window resets (fixes the tail). ──
  const stragglers = sortedLessons.filter(l => !done.written.has(l.id))
  if (stragglers.length) {
    await sleep(8000)
    for (const lesson of stragglers) {
      await produceLesson(lesson)
      await sleep(6000)
    }
  }

  const writtenCount     = { success: done.written.size,     failed: sortedLessons.length - done.written.size }
  const visualCount      = { success: done.visual.size,      failed: sortedLessons.length - done.visual.size }
  const interactiveCount = { success: done.interactive.size, failed: sortedLessons.length - done.interactive.size }

  telemetry.dbWrite('digital_assets', totalAssets)

  // Deduct credits once for the full run
  await serviceClient.rpc('check_and_deduct_credits', {
    p_user_id:    userId,
    p_cost_units: CREDIT_COST,
  })

  // ── 4. Transition status ─────────────────────────────────
  await serviceClient.rpc('transition_course_status', {
    p_course_id:  courseId,
    p_new_status: 'content_review',
    p_actor_id:   AGENT_NAME,
    p_metadata:   {
      total_lessons:   sortedLessons.length,
      total_assets:    totalAssets,
      written_success: writtenCount.success,
      visual_success:  visualCount.success,
      interactive_success: interactiveCount.success,
    },
  })
  telemetry.statusTransitioned('content_production', 'content_review')

  // ── 5. Create approval ───────────────────────────────────
  const { data: approval } = await serviceClient
    .from('approvals')
    .insert({
      course_id:      courseId,
      approval_stage: 'content_review',
      target_type:    'full_course',
      target_id:      courseId,
    })
    .select()
    .single()

  if (approval) telemetry.approvalCreated(approval.id, 'content_review')

  return {
    nextStatus: 'content_review',
    outputSummary: {
      total_lessons:  sortedLessons.length,
      total_assets:   totalAssets,
      written:        `${writtenCount.success}/${sortedLessons.length}`,
      visual:         `${visualCount.success}/${sortedLessons.length}`,
      interactive:    `${interactiveCount.success}/${sortedLessons.length}`,
      mvc_only:       mvcOnly,
    },
  }
}
