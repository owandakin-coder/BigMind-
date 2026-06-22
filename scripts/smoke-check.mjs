/**
 * smoke-check.mjs — read from .env.local, check + fix course/credits for smoke test.
 * Usage: node scripts/smoke-check.mjs [courseId]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(resolve(__dir, '../.env.local'), 'utf8')
const env    = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const COURSE_ID = process.argv[2] ?? '91b1abe9-255b-452e-b4b3-1dd14eec28cd'
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
  // ── 1. Current course state ──────────────────────────────────────────────
  const { data: course, error: ce } = await sb
    .from('courses')
    .select('id, status, owner_id, title')
    .eq('id', COURSE_ID)
    .single()
  if (ce || !course) { console.error('Course not found:', ce?.message); process.exit(1) }

  console.log('\n── Course ──────────────────────────────────────')
  console.log('  ID:     ', course.id)
  console.log('  Title:  ', course.title)
  console.log('  Status: ', course.status)
  console.log('  Owner:  ', course.owner_id)

  // ── 2. Current credit state ──────────────────────────────────────────────
  const { data: prof } = await sb
    .from('user_profiles')
    .select('ai_credits, credits_limit, plan')
    .eq('id', course.owner_id)
    .single()

  console.log('\n── Credits ─────────────────────────────────────')
  console.log('  ai_credits:   ', prof?.ai_credits)
  console.log('  credits_limit:', prof?.credits_limit)
  console.log('  plan:         ', prof?.plan)

  // ── 3. Fix credits if exhausted ──────────────────────────────────────────
  if (prof && prof.ai_credits < 100) {
    const { error: ue } = await sb
      .from('user_profiles')
      .update({ ai_credits: 500 })
      .eq('id', course.owner_id)
    if (ue) console.error('  ✗ credit update failed:', ue.message)
    else    console.log('  ✓ ai_credits reset to 500')
  } else {
    console.log('  ✓ credits OK — no reset needed')
  }

  // ── 4. Fix course status ONLY if failed ──────────────────────────────────
  // (Previously this clobbered ANY in-flight status back to architecture_design,
  //  destroying pipeline progress. Now it only recovers from 'failed'.)
  console.log('\n── Status fix ──────────────────────────────────')
  if (course.status === 'failed') {
    const { error: su } = await sb
      .from('courses')
      .update({ status: 'architecture_design', updated_at: new Date().toISOString() })
      .eq('id', COURSE_ID)
    if (su) console.error('  ✗ status update failed:', su.message)
    else    console.log('  ✓ status was failed → reset to architecture_design')
  } else {
    console.log(`  ✓ status is ${course.status} — left untouched`)
  }

  // ── 5. Verify final state ────────────────────────────────────────────────
  const { data: after } = await sb
    .from('courses')
    .select('status')
    .eq('id', COURSE_ID)
    .single()
  const { data: afterProf } = await sb
    .from('user_profiles')
    .select('ai_credits')
    .eq('id', course.owner_id)
    .single()

  console.log('\n── Final state ─────────────────────────────────')
  console.log('  status:    ', after?.status)
  console.log('  ai_credits:', afterProf?.ai_credits)
  console.log('\nSmoke test ready — refresh the course page.\n')
}

main().catch(e => { console.error(e); process.exit(1) })
