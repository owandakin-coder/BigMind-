#!/usr/bin/env node
/**
 * verify-rls.mjs — CI gate for Row Level Security coverage
 *
 * Connects to the Supabase database using service role credentials
 * and asserts that every user-facing table has RLS enabled.
 *
 * Exit 0 = all tables secured
 * Exit 1 = one or more tables missing RLS
 *
 * Usage:
 *   SUPABASE_DB_URL=postgres://... node scripts/verify-rls.mjs
 *
 *   Or via package.json:
 *   npm run verify-rls
 */

import pg from 'pg'

const { Client } = pg

const DB_URL = process.env.SUPABASE_DB_URL

if (!DB_URL) {
  console.error('❌  SUPABASE_DB_URL environment variable is not set.')
  process.exit(1)
}

/* ── Tables that MUST have RLS enabled ──────────────────────── */
const REQUIRED_RLS_TABLES = [
  'user_profiles',
  'courses',
  'course_iterations',
  'market_research_documents',
  'course_blueprints',
  'modules',
  'lessons',
  'digital_assets',
  'approvals',
  'agent_logs',
  'analytics_events',
  'analytics_tasks',
  'market_embeddings',
  'platform_publish_logs',
]

/* ── Additional security assertions ────────────────────────── */
const STATE_MACHINE_CHECKS = [
  // Validate the state machine allows the happy-path first transition
  {
    query: `SELECT public.validate_state_transition('draft'::public.course_status, 'market_research'::public.course_status)`,
    expected: true,
    description: 'draft → market_research is a valid transition',
  },
  // Validate the state machine blocks illegal transitions
  {
    query: `SELECT public.validate_state_transition('draft'::public.course_status, 'published'::public.course_status)`,
    expected: false,
    description: 'draft → published is NOT a valid transition',
  },
  // Validate that approved is reachable from publishing_confirmed
  {
    query: `SELECT public.validate_state_transition('publishing_confirmed'::public.course_status, 'approved'::public.course_status)`,
    expected: true,
    description: 'publishing_confirmed → approved is a valid transition',
  },
]

/* ── Immutability checks ────────────────────────────────────── */
const IMMUTABILITY_CHECK = `
  SELECT trigger_name FROM information_schema.triggers
  WHERE trigger_schema = 'public'
    AND trigger_name = 'trg_agent_logs_immutable'
`

/* ── ENUM integrity check ───────────────────────────────────── */
const ENUM_COUNT_QUERY = `
  SELECT COUNT(*) AS cnt
  FROM pg_enum e
  JOIN pg_type t ON e.enumtypid = t.oid
  WHERE t.typname = 'course_status'
`
const EXPECTED_COURSE_STATUS_VALUES = 21

async function main() {
  const client = new Client({ connectionString: DB_URL })

  let exitCode = 0
  const errors = []
  const passes = []

  try {
    await client.connect()
    console.log('\n📋  CourseForge AI — RLS & Security Verification\n')
    console.log('═'.repeat(56))

    /* ── 1. RLS coverage ──────────────────────────────────── */
    console.log('\n[1/4] Row Level Security Coverage\n')

    const { rows: rlsRows } = await client.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `)

    const rlsMap = Object.fromEntries(rlsRows.map(r => [r.tablename, r.rowsecurity]))

    for (const table of REQUIRED_RLS_TABLES) {
      const hasRLS = rlsMap[table]
      if (hasRLS === true) {
        passes.push(`RLS: ${table}`)
        console.log(`  ✅  ${table}`)
      } else if (hasRLS === false) {
        errors.push(`MISSING RLS on table: ${table}`)
        console.log(`  ❌  ${table} — RLS DISABLED`)
        exitCode = 1
      } else {
        errors.push(`TABLE NOT FOUND: ${table}`)
        console.log(`  ⚠️   ${table} — TABLE DOES NOT EXIST`)
        exitCode = 1
      }
    }

    /* ── 2. State machine transitions ────────────────────── */
    console.log('\n[2/4] State Machine Integrity\n')

    for (const check of STATE_MACHINE_CHECKS) {
      const { rows } = await client.query(check.query)
      const actual = Object.values(rows[0])[0]
      const pass = actual === check.expected

      if (pass) {
        passes.push(`SM: ${check.description}`)
        console.log(`  ✅  ${check.description}`)
      } else {
        errors.push(`State machine FAIL: ${check.description} (expected ${check.expected}, got ${actual})`)
        console.log(`  ❌  ${check.description}`)
        exitCode = 1
      }
    }

    /* ── 3. Immutable audit log trigger ─────────────────── */
    console.log('\n[3/4] Immutable Audit Log\n')

    const { rows: triggerRows } = await client.query(IMMUTABILITY_CHECK)
    if (triggerRows.length > 0) {
      passes.push('Immutable audit trigger present')
      console.log(`  ✅  trg_agent_logs_immutable is installed`)
    } else {
      errors.push('MISSING immutable trigger on agent_logs')
      console.log(`  ❌  trg_agent_logs_immutable NOT FOUND`)
      exitCode = 1
    }

    /* ── 4. ENUM count ───────────────────────────────────── */
    console.log('\n[4/4] CourseStatus ENUM Count\n')

    const { rows: enumRows } = await client.query(ENUM_COUNT_QUERY)
    const count = parseInt(enumRows[0].cnt, 10)

    if (count === EXPECTED_COURSE_STATUS_VALUES) {
      passes.push(`ENUM count: ${count}/${EXPECTED_COURSE_STATUS_VALUES}`)
      console.log(`  ✅  course_status has ${count} values (expected ${EXPECTED_COURSE_STATUS_VALUES})`)
    } else {
      errors.push(`ENUM count mismatch: expected ${EXPECTED_COURSE_STATUS_VALUES}, got ${count}`)
      console.log(`  ❌  course_status has ${count} values, expected ${EXPECTED_COURSE_STATUS_VALUES}`)
      exitCode = 1
    }

    /* ── Summary ─────────────────────────────────────────── */
    console.log('\n' + '═'.repeat(56))
    console.log(`\n  ${passes.length} checks passed · ${errors.length} checks failed\n`)

    if (errors.length > 0) {
      console.log('Failures:')
      errors.forEach(e => console.log(`  • ${e}`))
      console.log('')
    }

  } catch (err) {
    console.error('\n❌  Verification failed with error:', err.message)
    exitCode = 1
  } finally {
    await client.end()
    process.exit(exitCode)
  }
}

main()
