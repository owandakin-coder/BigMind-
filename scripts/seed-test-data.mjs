#!/usr/bin/env node
/**
 * seed-test-data.mjs
 * Seeds a CourseForge AI Supabase instance with realistic test data.
 * Use for local dev, staging, and E2E test warm-up.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-test-data.mjs
 *   node scripts/seed-test-data.mjs --clean   # drop existing test data first
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL              = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CLEAN                     = process.argv.includes('--clean')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/* ── Helpers ──────────────────────────────────────────────── */

function log(msg) { process.stdout.write(`  ${msg}\n`) }
function ok(msg)  { process.stdout.write(`  ✓ ${msg}\n`) }
function err(msg, e) { process.stderr.write(`  ✗ ${msg}: ${e?.message ?? e}\n`) }

async function must(label, fn) {
  const { data, error } = await fn()
  if (error) { err(label, error); process.exit(1) }
  ok(label)
  return data
}

/* ── Clean existing seed data ─────────────────────────────── */

async function cleanSeedData() {
  log('Cleaning existing seed data…')
  const { data: users } = await sb.auth.admin.listUsers()
  const seedUsers = (users?.users ?? []).filter(u => u.email?.endsWith('@courseforge-seed.dev'))
  for (const u of seedUsers) {
    await sb.auth.admin.deleteUser(u.id)
    log(`  Deleted seed user ${u.email}`)
  }
  ok('Seed data cleaned')
}

/* ── Main seed ────────────────────────────────────────────── */

async function seed() {
  console.log('\n🌱  CourseForge AI — Seed Script\n')
  if (CLEAN) await cleanSeedData()

  // ── 1. Create demo users ─────────────────────────────────
  log('Creating demo users…')

  const users = [
    { email: 'alice@courseforge-seed.dev', name: 'Alice Chen',   plan: 'pro',        credits: 500 },
    { email: 'bob@courseforge-seed.dev',   name: 'Bob Martinez', plan: 'starter',    credits: 100 },
    { email: 'carol@courseforge-seed.dev', name: 'Carol Singh',  plan: 'enterprise', credits: 9999 },
  ]

  const createdUsers = []
  for (const u of users) {
    const { data: auth } = await sb.auth.admin.createUser({
      email: u.email, password: 'SeedPass123!', email_confirm: true,
    })
    const userId = auth.user.id

    await sb.from('user_profiles').upsert({
      id: userId, display_name: u.name, plan: u.plan,
      ai_credits: u.credits, credits_limit: u.credits * 2,
    }, { onConflict: 'id' })

    createdUsers.push({ ...u, id: userId })
    ok(`  User: ${u.email} (${u.plan})`)
  }

  // ── 2. Create courses at various pipeline stages ─────────
  log('Creating demo courses…')

  const courseSpecs = [
    {
      userId:  createdUsers[0].id,
      title:   'AI-Powered Freelancing Masterclass',
      niche:   'freelance software development',
      status:  'publishing_confirmed',
      price:   497,
      published: true,
    },
    {
      userId:  createdUsers[0].id,
      title:   'React Performance Patterns',
      niche:   'frontend development',
      status:  'content_review',
      price:   297,
      published: false,
    },
    {
      userId:  createdUsers[1].id,
      title:   'ChatGPT for Business Owners',
      niche:   'AI productivity for non-technical users',
      status:  'market_review',
      price:   197,
      published: false,
    },
    {
      userId:  createdUsers[2].id,
      title:   'Enterprise Design Systems',
      niche:   'product design leadership',
      status:  'analytics_review',
      price:   997,
      published: false,
    },
  ]

  const createdCourses = []
  for (const spec of courseSpecs) {
    const { data: course } = await sb.from('courses').insert({
      user_id:      spec.userId,
      title:        spec.title,
      target_niche: spec.niche,
      status:       spec.status,
      price_usd:    spec.price,
      published_at: spec.published ? new Date().toISOString() : null,
    }).select().single()

    createdCourses.push({ ...spec, id: course.id })
    ok(`  Course: "${spec.title}" → ${spec.status}`)
  }

  // ── 3. Seed market research documents ────────────────────
  log('Seeding market research documents…')
  for (const course of createdCourses) {
    await sb.from('market_research_documents').insert({
      course_id: course.id,
      content: {
        market_size_usd:  Math.floor(Math.random() * 5e9) + 1e9,
        opportunity_score: Math.floor(Math.random() * 30) + 65,
        target_audience: `Professionals in ${course.niche}`,
        pain_points: ['Time constraints', 'Lack of structured learning', 'Imposter syndrome'],
        top_keywords: [course.niche, `learn ${course.niche}`, `${course.niche} course`],
        recommended_price: course.price,
        growth_rate_pct: 14.2,
      },
      is_active: true,
    })
  }
  ok('Market research documents seeded')

  // ── 4. Seed course blueprints ─────────────────────────────
  log('Seeding course blueprints…')
  for (const course of createdCourses) {
    await sb.from('course_blueprints').insert({
      course_id: course.id,
      content: {
        title: course.title,
        modules: Array.from({ length: 4 }, (_, mi) => ({
          id: `mod-${mi + 1}`,
          title: `Module ${mi + 1}`,
          lessons: Array.from({ length: 3 }, (_, li) => ({
            id: `les-${mi + 1}-${li + 1}`,
            title: `Lesson ${li + 1}`,
            type: ['written', 'visual', 'interactive'][li % 3],
            duration_min: 15 + li * 5,
          })),
        })),
        total_duration_min: 240,
        difficulty: 'intermediate',
      },
      is_active: true,
    })
  }
  ok('Course blueprints seeded')

  // ── 5. Seed digital assets ────────────────────────────────
  log('Seeding digital assets…')
  const assetTypes = ['sales_page', 'publishing_report', 'seo_report', 'portfolio_report']
  for (const course of createdCourses) {
    for (const assetType of assetTypes) {
      await sb.from('digital_assets').insert({
        course_id:   course.id,
        source_type: 'course',
        source_id:   course.id,
        asset_type:  assetType,
        is_active:   true,
        content: { type: assetType, course_id: course.id, generated_at: new Date().toISOString() },
      })
    }
  }
  ok('Digital assets seeded')

  // ── 6. Seed analytics events ──────────────────────────────
  log('Seeding analytics events…')
  const eventTypes = ['lesson_completion', 'lesson_dropout', 'quiz_pass', 'page_view', 'video_play']
  for (const course of createdCourses) {
    const events = Array.from({ length: 100 }, (_, i) => ({
      course_id:   course.id,
      event_type:  eventTypes[i % eventTypes.length],
      event_value: eventTypes[i % eventTypes.length] === 'lesson_completion' ? 0.6 + Math.random() * 0.4 : null,
      metadata:    { lesson_id: `les-${(i % 12) + 1}`, user_segment: i % 3 === 0 ? 'premium' : 'standard' },
      created_at:  new Date(Date.now() - i * 3600000).toISOString(),
    }))
    await sb.from('analytics_events').insert(events)
  }
  ok('Analytics events seeded (400 total)')

  // ── 7. Seed revenue events for published course ───────────
  log('Seeding revenue events…')
  const publishedCourse = createdCourses.find(c => c.published)
  if (publishedCourse) {
    const revenueEvts = Array.from({ length: 47 }, (_, i) => ({
      course_id:   publishedCourse.id,
      event_type:  i % 10 === 0 ? 'refund' : 'purchase',
      amount_usd:  i % 10 === 0 ? -publishedCourse.price : publishedCourse.price,
      metadata:    { platform: i % 2 === 0 ? 'gumroad' : 'teachable', transaction_id: `txn-${i}` },
      occurred_at: new Date(Date.now() - i * 86400000).toISOString(),
    }))
    await sb.from('revenue_events').insert(revenueEvts)
    ok('Revenue events seeded (47 events)')
  }

  // ── 8. Seed agent_logs ────────────────────────────────────
  log('Seeding agent logs…')
  const agentSeq = [
    'market_research_agent', 'course_architect_agent', 'content_production_agent',
    'sales_page_agent', 'marketing_agent', 'analytics_agent', 'publishing_agent',
  ]
  for (const course of createdCourses) {
    for (const agent of agentSeq) {
      await sb.from('agent_logs').insert({
        course_id:       course.id,
        agent_name:      agent,
        status:          'success',
        credits_used:    Math.floor(Math.random() * 8) + 1,
        output_summary:  `${agent} completed successfully`,
        started_at:      new Date(Date.now() - 60000).toISOString(),
        completed_at:    new Date().toISOString(),
        duration_ms:     Math.floor(Math.random() * 60000) + 5000,
      })
    }
  }
  ok('Agent logs seeded')

  // ── 9. Seed approval records ──────────────────────────────
  log('Seeding approval records…')
  for (const course of createdCourses) {
    await sb.from('approvals').insert({
      course_id:    course.id,
      gate_name:    'market_review',
      requested_by: 'market_research_agent',
      is_pending:   false,
      action:       'approved',
      feedback:     'Excellent market opportunity.',
      reviewed_at:  new Date().toISOString(),
    })
  }
  ok('Approval records seeded')

  // ── 10. Seed SEO metadata for published course ────────────
  if (publishedCourse) {
    await sb.from('seo_metadata').upsert({
      course_id:        publishedCourse.id,
      primary_keyword:  'freelance developer course',
      secondary_keywords: ['how to freelance as a developer', 'developer consulting'],
      meta_title:       'AI-Powered Freelancing Masterclass | Go Freelance in 90 Days',
      meta_description: 'Learn how to transition from employed developer to 6-figure freelancer with our AI-enhanced system.',
      slug:             'ai-freelancing-masterclass',
      estimated_monthly_searches: 8200,
      keyword_difficulty: 42,
    }, { onConflict: 'course_id' })
    ok('SEO metadata seeded')
  }

  // ── Summary ───────────────────────────────────────────────
  console.log('\n✅  Seed complete!\n')
  console.log(`   Users:    ${createdUsers.length}`)
  console.log(`   Courses:  ${createdCourses.length}`)
  console.log(`   Assets:   ${createdCourses.length * assetTypes.length}`)
  console.log('\n   Demo logins:')
  for (const u of createdUsers) {
    console.log(`   ${u.email}  /  SeedPass123!  (${u.plan})`)
  }
  console.log()
}

seed().catch(e => { console.error(e); process.exit(1) })
