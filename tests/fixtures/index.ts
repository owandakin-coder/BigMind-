/**
 * Test fixture factories for CourseForge AI integration and E2E tests.
 * Used by: tests/e2e/workflow.test.ts, tests/approval-flow.test.ts
 */

import type { Database } from '../../src/types/database.types'

type CourseInsert = Database['public']['Tables']['courses']['Insert']
type ApprovalInsert = Database['public']['Tables']['approvals']['Insert']
type AgentLogInsert = Database['public']['Tables']['agent_logs']['Insert']
type AnalyticsEventInsert = Database['public']['Tables']['analytics_events']['Insert']
type RevenueEventInsert = Database['public']['Tables']['revenue_events']['Insert']

/* ── User fixtures ───────────────────────────────────────────── */

export function testEmail(suffix?: string): string {
  return `test-${suffix ?? Date.now()}-${Math.random().toString(36).slice(2)}@courseforge-test.dev`
}

export function testPassword(): string {
  return 'TestPass123!CourseForge'
}

/* ── Course fixtures ─────────────────────────────────────────── */

export function draftCourse(userId: string, overrides: Partial<CourseInsert> = {}): CourseInsert {
  return {
    user_id:      userId,
    title:        'Test: AI-Powered Freelancing Masterclass',
    target_niche: 'freelance software development',
    status:       'draft',
    price_usd:    497,
    ...overrides,
  }
}

export function courseAtStatus(
  userId: string,
  status: string,
  overrides: Partial<CourseInsert> = {}
): CourseInsert {
  return {
    ...draftCourse(userId),
    status,
    ...overrides,
  }
}

/* ── Market research document fixtures ──────────────────────── */

export function marketResearchDoc(courseId: string) {
  return {
    course_id: courseId,
    content: {
      market_size_usd: 2_400_000_000,
      tam_addressable: 480_000_000,
      growth_rate_pct: 18.5,
      target_audience: 'Software developers with 2-5 years experience seeking to go freelance',
      pain_points: [
        'Not knowing how to price services',
        'Finding first clients without experience',
        'Managing multiple clients and projects',
        'Building a personal brand online',
      ],
      top_competitors: [
        { name: 'Upwork Academy', price: 299, rating: 4.1 },
        { name: 'Freelance Jumpstart', price: 397, rating: 4.4 },
      ],
      positioning: 'AI-enhanced practical workflow for developers transitioning to freelance',
      opportunity_score: 82,
      top_keywords: ['freelance developer', 'software consulting', 'developer side income'],
      recommended_price: 497,
      launch_strategy: 'Beta cohort → LinkedIn + Twitter launch → Course marketplace listing',
    },
    is_active: true,
  }
}

/* ── Course blueprint fixtures ───────────────────────────────── */

export function courseBlueprint(courseId: string) {
  return {
    course_id: courseId,
    content: {
      title: 'AI-Powered Freelancing Masterclass',
      modules: [
        {
          id: 'mod-1',
          title: 'Foundations of Developer Freelancing',
          description: 'Core mindset and business setup',
          lessons: [
            { id: 'les-1-1', title: 'The Freelance Developer Mindset', type: 'written', duration_min: 15 },
            { id: 'les-1-2', title: 'Legal Structure and Contracts', type: 'written', duration_min: 20 },
            { id: 'les-1-3', title: 'Setting Up Your Business Entity', type: 'interactive', duration_min: 30 },
          ],
        },
        {
          id: 'mod-2',
          title: 'Pricing and Positioning',
          description: 'How to price and package your services',
          lessons: [
            { id: 'les-2-1', title: 'Value-Based Pricing Framework', type: 'written', duration_min: 25 },
            { id: 'les-2-2', title: 'Service Package Design', type: 'written', duration_min: 20 },
          ],
        },
        {
          id: 'mod-3',
          title: 'Landing Your First Clients',
          description: 'Outreach, networking, and closing',
          lessons: [
            { id: 'les-3-1', title: 'LinkedIn Cold Outreach That Works', type: 'written', duration_min: 20 },
            { id: 'les-3-2', title: 'Portfolio Building Without Past Clients', type: 'visual', duration_min: 15 },
          ],
        },
      ],
      total_duration_min: 145,
      difficulty: 'intermediate',
    },
    is_active: true,
  }
}

/* ── Sales page fixture ──────────────────────────────────────── */

export function salesPageAsset(courseId: string) {
  return {
    course_id:   courseId,
    source_type: 'course',
    source_id:   courseId,
    asset_type:  'sales_page',
    is_active:   true,
    content: {
      headline: 'Go From Developer to 6-Figure Freelancer in 90 Days',
      subheadline: 'The AI-enhanced system that removes every excuse for staying in a 9-to-5',
      price_usd: 497,
      price_anchor: 997,
      cta_text: 'Start Freelancing Today',
      testimonials: [],
      guarantee_days: 30,
    },
  }
}

/* ── Agent log fixture ───────────────────────────────────────── */

export function agentLog(
  courseId: string,
  agentName: string,
  status: 'running' | 'success' | 'failed' = 'success',
  overrides: Partial<AgentLogInsert> = {}
): AgentLogInsert {
  return {
    course_id:  courseId,
    agent_name: agentName,
    status,
    credits_used: 5,
    output_summary: `${agentName} completed successfully`,
    started_at: new Date(Date.now() - 30000).toISOString(),
    completed_at: status !== 'running' ? new Date().toISOString() : undefined,
    duration_ms: status !== 'running' ? 28000 : undefined,
    ...overrides,
  }
}

/* ── Analytics events fixture ────────────────────────────────── */

export function analyticsEvents(courseId: string, count = 50): AnalyticsEventInsert[] {
  const types = ['lesson_completion', 'lesson_dropout', 'quiz_pass', 'page_view', 'video_play']
  return Array.from({ length: count }, (_, i) => ({
    course_id:   courseId,
    event_type:  types[i % types.length],
    event_value: types[i % types.length] === 'lesson_completion' ? 0.7 + Math.random() * 0.3 : undefined,
    metadata:    { lesson_id: `les-${(i % 6) + 1}`, session_id: `sess-${i}` },
    created_at:  new Date(Date.now() - i * 3600000).toISOString(),
  }))
}

/* ── Revenue events fixture ──────────────────────────────────── */

export function revenueEvents(courseId: string, count = 20): RevenueEventInsert[] {
  return Array.from({ length: count }, (_, i) => ({
    course_id:   courseId,
    event_type:  i % 8 === 0 ? 'refund' : 'purchase',
    amount_usd:  i % 8 === 0 ? -497 : 497,
    metadata:    { platform: 'gumroad', transaction_id: `txn-${i}` },
    occurred_at: new Date(Date.now() - i * 86400000).toISOString(),
  }))
}

/* ── Approval fixture ────────────────────────────────────────── */

export function pendingApproval(courseId: string, gateName: string): ApprovalInsert {
  return {
    course_id:    courseId,
    gate_name:    gateName,
    requested_by: 'test_agent',
    metadata:     { test: true },
  }
}

/* ── Full pipeline stage snapshot ────────────────────────────── */

export const PIPELINE_STAGES = [
  { status: 'market_research',      agent: 'market_research_agent',    nextStatus: 'market_review'      },
  { status: 'market_review',        action: 'approved',                 nextStatus: 'course_architecture' },
  { status: 'course_architecture',  agent: 'course_architect_agent',   nextStatus: 'architecture_review' },
  { status: 'architecture_review',  action: 'approved',                 nextStatus: 'content_production'  },
  { status: 'content_production',   agent: 'content_production_agent', nextStatus: 'content_review'       },
  { status: 'content_review',       action: 'approved',                 nextStatus: 'sales_page_generation'},
  { status: 'sales_page_generation',agent: 'sales_page_agent',         nextStatus: 'marketing_assets'     },
  { status: 'marketing_assets',     agent: 'marketing_agent',          nextStatus: 'analytics_review'     },
  { status: 'analytics_review',     agent: 'analytics_agent',          nextStatus: 'final_approval_gate'  },
  { status: 'final_approval_gate',  action: 'approved',                 nextStatus: 'publishing'           },
  { status: 'publishing',           agent: 'publishing_agent',         nextStatus: 'publishing_confirmed' },
] as const
