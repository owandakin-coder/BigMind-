#!/usr/bin/env node
/**
 * validation-report.mjs
 * Runs a live read-only audit against a Supabase instance and prints
 * a validation report confirming system readiness.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tests/e2e/validation-report.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required')
  process.exit(1)
}

const sb = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const checks = []
function pass(name, detail = '')  { checks.push({ ok: true,  name, detail }) }
function fail(name, detail = '')  { checks.push({ ok: false, name, detail }) }

async function check(name, fn) {
  try {
    const result = await fn()
    if (result === false) fail(name)
    else pass(name, typeof result === 'string' ? result : '')
  } catch(e) {
    fail(name, e.message)
  }
}

async function run() {
  console.log('\n🔍  CourseForge AI — Validation Report\n')

  // ── Schema checks ──────────────────────────────────────
  await check('courses table exists', async () => {
    const { error } = await sb.from('courses').select('id').limit(0)
    if (error) throw new Error(error.message)
    return `ok`
  })

  await check('course_blueprints table exists', async () => {
    const { error } = await sb.from('course_blueprints').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('agent_logs table exists', async () => {
    const { error } = await sb.from('agent_logs').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('approvals table exists', async () => {
    const { error } = await sb.from('approvals').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('digital_assets table exists', async () => {
    const { error } = await sb.from('digital_assets').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('analytics_events table exists', async () => {
    const { error } = await sb.from('analytics_events').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('revenue_events table exists', async () => {
    const { error } = await sb.from('revenue_events').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('user_profiles table exists', async () => {
    const { error } = await sb.from('user_profiles').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('seo_metadata table exists', async () => {
    const { error } = await sb.from('seo_metadata').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  await check('portfolio_courses table exists', async () => {
    const { error } = await sb.from('portfolio_courses').select('id').limit(0)
    if (error) throw new Error(error.message)
  })

  // ── RPC function checks ──────────────────────────────
  await check('transition_course_status RPC exists', async () => {
    // Just check it's callable (will fail with bad args, not "function not found")
    const { error } = await sb.rpc('transition_course_status', {
      p_course_id: '00000000-0000-0000-0000-000000000000',
      p_new_status: 'draft',
      p_actor_id: 'validator',
      p_metadata: {},
    })
    // Expected to fail with "Course not found" or similar — not "function not found"
    if (error?.message?.includes('function') && error?.message?.includes('not exist')) throw new Error(error.message)
    return 'RPC callable'
  })

  await check('perform_approval_action RPC exists', async () => {
    const { error } = await sb.rpc('perform_approval_action', {
      p_approval_id: '00000000-0000-0000-0000-000000000000',
      p_action: 'approved',
      p_feedback: '',
    })
    if (error?.message?.includes('function') && error?.message?.includes('not exist')) throw new Error(error.message)
    return 'RPC callable'
  })

  await check('get_pending_approvals RPC exists', async () => {
    const { error } = await sb.rpc('get_pending_approvals', {
      p_course_id: '00000000-0000-0000-0000-000000000000',
    })
    if (error?.message?.includes('function') && error?.message?.includes('not exist')) throw new Error(error.message)
    return 'RPC callable'
  })

  // ── Data integrity checks ────────────────────────────
  await check('At least one user exists', async () => {
    const { data } = await sb.auth.admin.listUsers()
    if (!data?.users?.length) return false
    return `${data.users.length} users`
  })

  await check('At least one course exists', async () => {
    const { data } = await sb.from('courses').select('id').limit(1)
    if (!data?.length) return false
    return `courses present`
  })

  await check('Agent logs are being written', async () => {
    const { data } = await sb.from('agent_logs').select('id').limit(1)
    return data?.length ? 'logs present' : false
  })

  // ── Report ───────────────────────────────────────────
  const passed = checks.filter(c => c.ok).length
  const failed = checks.filter(c => !c.ok).length

  console.log('  Results:\n')
  for (const c of checks) {
    const icon = c.ok ? '✓' : '✗'
    const color = c.ok ? '\x1b[32m' : '\x1b[31m'
    const detail = c.detail ? `  (${c.detail})` : ''
    console.log(`  ${color}${icon}\x1b[0m ${c.name}${detail}`)
  }

  console.log(`\n  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error(e); process.exit(1) })
