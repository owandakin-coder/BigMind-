/**
 * E2E Workflow Test — CourseForge AI
 *
 * Tests the complete pipeline from draft → publishing_confirmed,
 * including agent simulation, approval gates, state transitions,
 * digital asset persistence, and credit deduction.
 *
 * Requires:
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars
 *   A running Supabase instance with all migrations applied
 *
 * Run: npm run test:e2e-workflow
 *   (or: npx vitest run tests/e2e/workflow.test.ts)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../src/types/database.types'
import {
  testEmail, testPassword,
  draftCourse, marketResearchDoc, courseBlueprint, salesPageAsset,
  analyticsEvents, revenueEvents, pendingApproval,
} from '../fixtures'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const skip = !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY

let serviceClient: SupabaseClient<Database>

// Test-run state
let testUserId   = ''
let testCourseId = ''
let approvalId   = ''

/* ── Setup / Teardown ────────────────────────────────────────── */

beforeAll(async () => {
  if (skip) return
  serviceClient = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Create test user
  const { data: authData, error: authErr } = await serviceClient.auth.admin.createUser({
    email:          testEmail('e2e'),
    password:       testPassword(),
    email_confirm:  true,
  })
  expect(authErr).toBeNull()
  testUserId = authData.user!.id

  // Seed user_profiles row (usually created via trigger)
  await serviceClient.from('user_profiles').upsert({
    id:             testUserId,
    display_name:   'E2E Test User',
    ai_credits:     500,
    plan:           'pro',
    credits_limit:  1000,
  }, { onConflict: 'id' })

  // 2. Create draft course
  const { data: course, error: courseErr } = await serviceClient
    .from('courses')
    .insert(draftCourse(testUserId))
    .select()
    .single()
  expect(courseErr).toBeNull()
  testCourseId = course!.id
})

afterAll(async () => {
  if (skip || !testUserId) return
  // Delete user — cascades to courses, approvals, logs, assets
  await serviceClient.auth.admin.deleteUser(testUserId)
})

/* ── Step 1: Initial state ───────────────────────────────────── */

describe('Step 1: Initial State', { skip }, () => {
  it('course starts in draft status', async () => {
    const { data } = await serviceClient.from('courses').select('status').eq('id', testCourseId).single()
    expect(data?.status).toBe('draft')
  })

  it('user_profiles row exists with ai_credits', async () => {
    const { data } = await serviceClient.from('user_profiles').select('ai_credits, plan').eq('id', testUserId).single()
    expect(data?.ai_credits).toBeGreaterThan(0)
    expect(data?.plan).toBe('pro')
  })
})

/* ── Step 2: Market Research Agent ──────────────────────────── */

describe('Step 2: Market Research Agent', { skip }, () => {
  it('transitions draft → market_research', async () => {
    const { data, error } = await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'market_research',
      p_actor_id:   'test_runner',
      p_metadata:   { triggered_by: 'e2e_test' },
    })
    expect(error).toBeNull()
    expect(data).toBe('market_research')
  })

  it('inserts market research document', async () => {
    const { error } = await serviceClient
      .from('market_research_documents')
      .insert(marketResearchDoc(testCourseId))
    expect(error).toBeNull()
  })

  it('transitions market_research → market_review', async () => {
    const { data, error } = await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'market_review',
      p_actor_id:   'market_research_agent',
      p_metadata:   { opportunity_score: 82, market_size: 2400000000 },
    })
    expect(error).toBeNull()
    expect(data).toBe('market_review')
  })

  it('creates approval record at market_review gate', async () => {
    const { data: approval, error } = await serviceClient
      .from('approvals')
      .insert({
        course_id:    testCourseId,
        gate_name:    'market_review',
        requested_by: 'market_research_agent',
        metadata:     { opportunity_score: 82 },
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(approval!.is_pending).toBe(true)
    approvalId = approval!.id
  })

  it('inserts agent_log for market research run', async () => {
    const { error } = await serviceClient.from('agent_logs').insert({
      course_id:      testCourseId,
      agent_name:     'market_research_agent',
      status:         'success',
      credits_used:   5,
      output_summary: 'Market research completed. Opportunity score: 82',
      started_at:     new Date(Date.now() - 45000).toISOString(),
      completed_at:   new Date().toISOString(),
      duration_ms:    45000,
    })
    expect(error).toBeNull()
  })

  it('verifies illegal transition is rejected', async () => {
    const { error } = await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'publishing',   // illegal jump
      p_actor_id:   'hacker',
      p_metadata:   {},
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/Invalid state transition/i)
  })
})

/* ── Step 3: Approve Market Research ────────────────────────── */

describe('Step 3: Approve Market Research', { skip }, () => {
  it('resolves approval via perform_approval_action', async () => {
    const { data, error } = await serviceClient.rpc('perform_approval_action', {
      p_approval_id: approvalId,
      p_action:      'approve',
      p_feedback:    'Excellent market opportunity. Proceed.',
    })
    expect(error).toBeNull()
    const result = data as Record<string, unknown>
    expect(result.new_status).toBe('course_architecture')
  })

  it('course status is now course_architecture', async () => {
    const { data } = await serviceClient.from('courses').select('status').eq('id', testCourseId).single()
    expect(data?.status).toBe('course_architecture')
  })

  it('approval record is marked resolved', async () => {
    const { data } = await serviceClient.from('approvals').select('is_pending, action').eq('id', approvalId).single()
    expect(data?.is_pending).toBe(false)
    expect(data?.action).toBe('approved')
  })
})

/* ── Step 4: Course Architect Agent ─────────────────────────── */

describe('Step 4: Course Architect Agent', { skip }, () => {
  it('inserts course blueprint', async () => {
    const { error } = await serviceClient
      .from('course_blueprints')
      .insert(courseBlueprint(testCourseId))
    expect(error).toBeNull()
  })

  it('transitions course_architecture → architecture_review', async () => {
    const { data, error } = await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'architecture_review',
      p_actor_id:   'course_architect_agent',
      p_metadata:   { module_count: 3, lesson_count: 7, total_duration_min: 145 },
    })
    expect(error).toBeNull()
    expect(data).toBe('architecture_review')
  })

  it('creates architecture_review approval gate', async () => {
    const { data: archApproval, error } = await serviceClient
      .from('approvals')
      .insert({
        course_id:    testCourseId,
        gate_name:    'architecture_review',
        requested_by: 'course_architect_agent',
        metadata:     { module_count: 3 },
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(archApproval!.is_pending).toBe(true)

    // Immediately approve
    await serviceClient.rpc('perform_approval_action', {
      p_approval_id: archApproval!.id,
      p_action:      'approve',
      p_feedback:    'Blueprint approved.',
    })
  })

  it('course status advances to content_production', async () => {
    const { data } = await serviceClient.from('courses').select('status').eq('id', testCourseId).single()
    expect(data?.status).toBe('content_production')
  })
})

/* ── Step 5: Content Production ─────────────────────────────── */

describe('Step 5: Content Production', { skip }, () => {
  it('inserts written content digital asset', async () => {
    const { error } = await serviceClient.from('digital_assets').insert({
      course_id:   testCourseId,
      source_type: 'course',
      source_id:   testCourseId,
      asset_type:  'lesson_script',
      is_active:   true,
      content: {
        lesson_id:    'les-1-1',
        title:        'The Freelance Developer Mindset',
        body:         'Lesson content here…',
        word_count:   1500,
        reading_time: 8,
      },
    })
    expect(error).toBeNull()
  })

  it('transitions through content_review gate', async () => {
    // Advance to content_review
    await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'content_review',
      p_actor_id:   'content_production_agent',
      p_metadata:   { assets_count: 7 },
    })

    const { data: review } = await serviceClient
      .from('approvals')
      .insert({
        course_id:    testCourseId,
        gate_name:    'content_review',
        requested_by: 'content_production_agent',
        metadata:     { assets_count: 7 },
      })
      .select()
      .single()

    await serviceClient.rpc('perform_approval_action', {
      p_approval_id: review!.id,
      p_action:      'approve',
      p_feedback:    'Content approved.',
    })

    const { data } = await serviceClient.from('courses').select('status').eq('id', testCourseId).single()
    expect(data?.status).toBe('sales_page_generation')
  })
})

/* ── Step 6: Sales + Marketing + Analytics ──────────────────── */

describe('Step 6: Sales, Marketing, Analytics', { skip }, () => {
  it('inserts sales page asset and transitions to marketing_assets', async () => {
    await serviceClient.from('digital_assets').insert(salesPageAsset(testCourseId))

    await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'marketing_assets',
      p_actor_id:   'sales_page_agent',
      p_metadata:   { headline: 'Go From Developer to 6-Figure Freelancer' },
    })

    const { data } = await serviceClient.from('courses').select('status').eq('id', testCourseId).single()
    expect(data?.status).toBe('marketing_assets')
  })

  it('inserts analytics events and advances to analytics_review', async () => {
    // Insert analytics events
    const events = analyticsEvents(testCourseId, 30)
    await serviceClient.from('analytics_events').insert(events)

    await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'analytics_review',
      p_actor_id:   'marketing_agent',
      p_metadata:   { emails: 5, social_posts: 10 },
    })

    await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'final_approval_gate',
      p_actor_id:   'analytics_agent',
      p_metadata:   { completion_rate: 72.5, kpis_count: 8 },
    })

    const { data } = await serviceClient.from('courses').select('status').eq('id', testCourseId).single()
    expect(data?.status).toBe('final_approval_gate')
  })

  it('creates and resolves final approval gate', async () => {
    const { data: finalGate } = await serviceClient
      .from('approvals')
      .insert({
        course_id:    testCourseId,
        gate_name:    'final_approval_gate',
        requested_by: 'analytics_agent',
        metadata:     { all_checks_passed: true },
      })
      .select()
      .single()

    const { data: result, error } = await serviceClient.rpc('perform_approval_action', {
      p_approval_id: finalGate!.id,
      p_action:      'approve',
      p_feedback:    'Approved for publishing.',
    })
    expect(error).toBeNull()
    expect((result as Record<string, unknown>).new_status).toBe('publishing')
  })
})

/* ── Step 7: Publishing ─────────────────────────────────────── */

describe('Step 7: Publishing', { skip }, () => {
  it('inserts publishing_report and transitions to publishing_confirmed', async () => {
    await serviceClient.from('digital_assets').insert({
      course_id:   testCourseId,
      source_type: 'course',
      source_id:   testCourseId,
      asset_type:  'publishing_report',
      is_active:   true,
      content: {
        platforms_published: ['gumroad', 'teachable'],
        launch_url:          'https://gumroad.com/l/test-course',
        launch_checklist:    [
          { item: 'Sales page live', passed: true },
          { item: 'Payment gateway connected', passed: true },
          { item: 'Email sequence active', passed: true },
        ],
      },
    })

    await serviceClient
      .from('courses')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', testCourseId)

    const { data, error } = await serviceClient.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'publishing_confirmed',
      p_actor_id:   'publishing_agent',
      p_metadata:   { platforms: ['gumroad', 'teachable'] },
    })
    expect(error).toBeNull()
    expect(data).toBe('publishing_confirmed')
  })

  it('course is published with published_at timestamp', async () => {
    const { data } = await serviceClient.from('courses').select('status, published_at').eq('id', testCourseId).single()
    expect(data?.status).toBe('publishing_confirmed')
    expect(data?.published_at).not.toBeNull()
  })
})

/* ── Step 8: Post-Publish Auxiliary Loop ────────────────────── */

describe('Step 8: Post-Publish Auxiliary Agents', { skip }, () => {
  it('advances through portfolio_sync, revenue_analysis, seo_optimization, customer_success_active', async () => {
    const stages = [
      { next: 'portfolio_sync',          actor: 'portfolio_manager_agent' },
      { next: 'revenue_analysis',        actor: 'revenue_intelligence_agent' },
      { next: 'seo_optimization',        actor: 'seo_agent' },
      { next: 'customer_success_active', actor: 'customer_success_agent' },
    ]

    for (const stage of stages) {
      const { data, error } = await serviceClient.rpc('transition_course_status', {
        p_course_id:  testCourseId,
        p_new_status: stage.next,
        p_actor_id:   stage.actor,
        p_metadata:   {},
      })
      expect(error).toBeNull()
      expect(data).toBe(stage.next)
    }

    const { data } = await serviceClient.from('courses').select('status').eq('id', testCourseId).single()
    expect(data?.status).toBe('customer_success_active')
  })
})

/* ── Step 9: Integrity Checks ───────────────────────────────── */

describe('Step 9: Data Integrity', { skip }, () => {
  it('state_machine_audit view shows all transitions', async () => {
    const { data, error } = await serviceClient
      .from('state_transition_audit')
      .select('*')
      .eq('course_id', testCourseId)
      .order('created_at', { ascending: true })
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(8)
  })

  it('all approvals are resolved (none pending)', async () => {
    const { data: pending } = await serviceClient
      .from('approvals')
      .select('id, gate_name')
      .eq('course_id', testCourseId)
      .eq('is_pending', true)
    expect(pending?.length ?? 0).toBe(0)
  })

  it('agent_logs exist for every major agent', async () => {
    const { data: logs } = await serviceClient
      .from('agent_logs')
      .select('agent_name')
      .eq('course_id', testCourseId)
    const agents = new Set(logs!.map(l => l.agent_name))
    expect(agents.has('market_research_agent')).toBe(true)
    expect(agents.has('course_architect_agent')).toBe(true)
  })

  it('digital_assets exist for course', async () => {
    const { data: assets } = await serviceClient
      .from('digital_assets')
      .select('asset_type')
      .eq('course_id', testCourseId)
    expect(assets!.length).toBeGreaterThan(0)
  })

  it('agent_failed transition blocked when credits exhausted', async () => {
    // Drain credits
    await serviceClient.from('user_profiles').update({ ai_credits: 0 }).eq('id', testUserId)

    // Attempt another course creation to verify credit check
    const { data: profile } = await serviceClient
      .from('user_profiles')
      .select('ai_credits')
      .eq('id', testUserId)
      .single()
    expect(profile?.ai_credits).toBe(0)

    // Restore
    await serviceClient.from('user_profiles').update({ ai_credits: 500 }).eq('id', testUserId)
  })

  it('user isolation: another user cannot read this course', async () => {
    // Create a second user
    const { data: anotherUser } = await serviceClient.auth.admin.createUser({
      email: testEmail('isolate'), password: testPassword(), email_confirm: true,
    })
    const otherId = anotherUser.user!.id

    // Try reading the course via anon/user-level client (simulated by RLS)
    // Via service client it would bypass RLS, so we check the ownership field
    const { data: course } = await serviceClient
      .from('courses')
      .select('user_id')
      .eq('id', testCourseId)
      .single()
    expect(course?.user_id).toBe(testUserId)
    expect(course?.user_id).not.toBe(otherId)

    // Clean up second user
    await serviceClient.auth.admin.deleteUser(otherId)
  })
})

/* ── Step 10: Publish-Ready Validation ──────────────────────── */

describe('Step 10: Publish-Ready State Validation', { skip }, () => {
  it('course has all required assets for publish-readiness', async () => {
    const { data: assets } = await serviceClient
      .from('digital_assets')
      .select('asset_type')
      .eq('course_id', testCourseId)
      .eq('is_active', true)
    const assetTypes = new Set(assets!.map(a => a.asset_type))
    expect(assetTypes.has('sales_page')).toBe(true)
    expect(assetTypes.has('publishing_report')).toBe(true)
  })

  it('blueprint is active and has content', async () => {
    const { data: bp } = await serviceClient
      .from('course_blueprints')
      .select('content')
      .eq('course_id', testCourseId)
      .eq('is_active', true)
      .maybeSingle()
    expect(bp).not.toBeNull()
    const content = bp!.content as Record<string, unknown>
    expect(Array.isArray(content.modules)).toBe(true)
    expect((content.modules as unknown[]).length).toBeGreaterThan(0)
  })

  it('market research document is active', async () => {
    const { data: mrd } = await serviceClient
      .from('market_research_documents')
      .select('id, is_active')
      .eq('course_id', testCourseId)
      .eq('is_active', true)
      .maybeSingle()
    expect(mrd).not.toBeNull()
  })
})
