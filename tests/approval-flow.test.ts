/**
 * Approval flow integration tests.
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY env vars.
 * Run: npm run test:integration
 *
 * These tests hit a real Supabase instance (staging/local).
 * They verify the SECURITY DEFINER functions enforce correct
 * state machine rules.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database.types'

const SUPABASE_URL              = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const skip = !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY

const serviceClient = skip
  ? null
  : createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// Test fixture IDs — set by beforeAll
let testUserId   = ''
let testCourseId = ''

describe('Approval Flow Integration', { skip }, () => {
  beforeAll(async () => {
    if (!serviceClient) return

    // Create test user
    const { data: authUser } = await serviceClient.auth.admin.createUser({
      email: `test-${Date.now()}@courseforge-test.dev`,
      password: 'TestPass123!',
      email_confirm: true,
    })
    testUserId = authUser.user!.id

    // Create test course
    const { data: course } = await serviceClient
      .from('courses')
      .insert({
        user_id: testUserId,
        title: 'Integration Test Course',
        target_niche: 'software engineering',
        status: 'draft',
      })
      .select()
      .single()
    testCourseId = course!.id
  })

  afterAll(async () => {
    if (!serviceClient || !testUserId) return
    // Clean up — cascade deletes course via FK
    await serviceClient.auth.admin.deleteUser(testUserId)
  })

  it('starts in draft status', async () => {
    const { data } = await serviceClient!
      .from('courses')
      .select('status')
      .eq('id', testCourseId)
      .single()
    expect(data?.status).toBe('draft')
  })

  it('transitions draft → market_research via transition_course_status', async () => {
    const { data, error } = await serviceClient!.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'market_research',
      p_actor_id:   'system',
      p_metadata:   {},
    })
    expect(error).toBeNull()
    expect(data).toBe('market_research')
  })

  it('rejects illegal transition market_research → published', async () => {
    const { error } = await serviceClient!.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'published',
      p_actor_id:   'system',
      p_metadata:   {},
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('Invalid state transition')
  })

  it('creates approval record at market_review gate', async () => {
    // Advance to market_review
    await serviceClient!.rpc('transition_course_status', {
      p_course_id:  testCourseId,
      p_new_status: 'market_review',
      p_actor_id:   'market_research_agent',
      p_metadata:   {},
    })

    // Create an approval
    const { data: approval } = await serviceClient!
      .from('approvals')
      .insert({
        course_id:     testCourseId,
        gate_name:     'market_review',
        requested_by:  'market_research_agent',
      })
      .select()
      .single()

    expect(approval).not.toBeNull()
    expect(approval!.is_pending).toBe(true)
    expect(approval!.action).toBeNull()
  })

  it('resolves approval via perform_approval_action', async () => {
    const pendingApprovals = await serviceClient!.rpc('get_pending_approvals', {
      p_course_id: testCourseId,
    })
    const approvalId = pendingApprovals.data?.[0]?.id
    expect(approvalId).toBeDefined()

    const { data, error } = await serviceClient!.rpc('perform_approval_action', {
      p_approval_id: approvalId,
      p_action:      'approve',
      p_feedback:    'Looks great!',
    })
    expect(error).toBeNull()
    expect((data as Record<string, unknown>).new_status).toBe('course_architecture')
  })

  it('agent_logs are immutable — UPDATE blocked', async () => {
    // Insert a log
    const { data: log } = await serviceClient!
      .from('agent_logs')
      .insert({
        course_id:   testCourseId,
        agent_name:  'market_research_agent',
        credits_used: 5,
        output_summary: 'Test run',
      })
      .select()
      .single()

    // Try to update — should be blocked by trg_agent_logs_immutable
    const { error } = await serviceClient!
      .from('agent_logs')
      .update({ output_summary: 'TAMPERED' })
      .eq('id', log!.id)

    expect(error).not.toBeNull()
  })
})
