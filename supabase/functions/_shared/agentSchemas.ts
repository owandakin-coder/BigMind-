/**
 * agentSchemas.ts — Zod output schemas for all 11 CourseForge AI agents.
 *
 * Each agent declares:
 *  - OutputSchema: Zod schema for structured LLM output validation
 *  - OutputType: inferred TypeScript type
 *
 * The LLM is instructed to emit JSON matching these schemas.
 * parseJsonSafe() from aiGateway.ts handles markdown fence stripping
 * before Zod validation.
 */

// Deno-compatible Zod import
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

/* ── Shared primitives ─────────────────────────────────────── */

const RiskLevel   = z.enum(['low', 'medium', 'high', 'critical'])
const Priority    = z.number().int().min(1).max(10)
const Score100    = z.number().min(0).max(100)
const UrlString   = z.string().url().or(z.literal(''))

/* ══════════════════════════════════════════════════════════════
   1. MARKET RESEARCH AGENT
══════════════════════════════════════════════════════════════ */

export const MarketResearchOutputSchema = z.object({
  demand_score:        Score100.describe('Demand signal strength 0-100'),
  opportunity_score:   Score100.describe('Competitive opportunity 0-100'),
  pivot_triggered:     z.boolean(),
  target_audience:     z.string().min(10).max(500),
  market_size:         z.string().max(600),
  top_keywords:        z.array(z.string()).min(3).max(20),
  pain_points:         z.array(z.string()).min(2).max(10),
  transformation_promise: z.string().min(20).max(500),
  price_sensitivity:   z.enum(['low', 'medium', 'high', 'premium']),
  recommended_price_usd: z.number().min(0).max(10000),
  competitors: z.array(z.object({
    name:     z.string(),
    url:      UrlString,
    weakness: z.string(),
    price_usd: z.number().optional(),
  })).max(10),
  pivot_options: z.array(z.object({
    title:      z.string(),
    rationale:  z.string(),
    demand_score: Score100,
  })).max(3),
  confidence_level: z.enum(['low', 'medium', 'high']),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type MarketResearchOutput = z.infer<typeof MarketResearchOutputSchema>

/* ══════════════════════════════════════════════════════════════
   2. COURSE ARCHITECT AGENT
══════════════════════════════════════════════════════════════ */

const LessonSchema = z.object({
  title:         z.string().min(3).max(200),
  core_concept:  z.string().min(10).max(500),
  hook:          z.string().max(300),           // C.O.R.E. Hook
  observation:   z.string().max(500),           // C.O.R.E. Concept
  reflection:    z.string().max(300),           // C.O.R.E. Exercise
  evaluation:    z.string().max(300),           // C.O.R.E. Quiz
  estimated_minutes: z.number().int().min(5).max(120),
  is_mvc:        z.boolean().default(false),
  content_types: z.array(z.enum(['video', 'text', 'quiz', 'worksheet', 'live_demo', 'case_study'])),
})

const ModuleSchema = z.object({
  title:            z.string().min(3).max(200),
  learning_outcome: z.string().min(10).max(500),
  is_mvc:           z.boolean().default(false),
  lessons:          z.array(LessonSchema).min(1).max(20),
})

export const CourseArchitectOutputSchema = z.object({
  course_title:      z.string().min(3).max(200),
  subtitle:          z.string().max(300),
  tagline:           z.string().max(150),
  learning_objectives: z.array(z.string()).min(3).max(10),
  prerequisites:     z.array(z.string()).max(5),
  target_completion_weeks: z.number().int().min(1).max(52),
  total_lessons:     z.number().int(),
  total_hours:       z.number(),
  modules:           z.array(ModuleSchema).min(2).max(20),
  curriculum_gaps:   z.array(z.string()).max(5),
  differentiation:   z.string().max(500),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type CourseArchitectOutput = z.infer<typeof CourseArchitectOutputSchema>

/* ══════════════════════════════════════════════════════════════
   3. CONTENT PRODUCTION AGENT
══════════════════════════════════════════════════════════════ */

export const WrittenContentOutputSchema = z.object({
  lesson_id: z.string().uuid(),
  title:     z.string(),
  body_markdown: z.string().min(100),
  key_takeaways: z.array(z.string()).min(2).max(7),
  call_to_action: z.string().max(200),
  word_count:    z.number().int(),
  reading_time_minutes: z.number(),
})

export const VisualContentOutputSchema = z.object({
  lesson_id: z.string().uuid(),
  slide_deck_outline: z.array(z.object({
    slide_number: z.number().int(),
    title:        z.string(),
    content_type: z.enum(['title', 'concept', 'example', 'diagram', 'summary', 'quiz']),
    notes:        z.string(),
  })),
  infographic_briefs: z.array(z.object({
    title:       z.string(),
    description: z.string(),
    data_points: z.array(z.string()),
  })).max(3),
  thumbnail_prompt: z.string().max(500),
})

export const InteractiveContentOutputSchema = z.object({
  lesson_id: z.string().uuid(),
  quiz: z.object({
    questions: z.array(z.object({
      question: z.string(),
      options:  z.array(z.string()).length(4),
      correct_index: z.number().int().min(0).max(3),
      explanation: z.string(),
    })).min(3).max(10),
    passing_score: z.number().min(0).max(100).default(70),
  }),
  worksheet: z.object({
    title:       z.string(),
    instructions: z.string(),
    exercises:   z.array(z.object({
      number:    z.number().int(),
      prompt:    z.string(),
      type:      z.enum(['fill_blank', 'short_answer', 'multiple_choice', 'reflection', 'action_item']),
    })).min(2).max(10),
  }).optional(),
  workbook_pages: z.array(z.string()).max(5),
})

export const ContentProductionOutputSchema = z.object({
  course_id:           z.string().uuid(),
  total_lessons_built: z.number().int(),
  written:    z.array(WrittenContentOutputSchema),
  visual:     z.array(VisualContentOutputSchema),
  interactive: z.array(InteractiveContentOutputSchema),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type ContentProductionOutput = z.infer<typeof ContentProductionOutputSchema>

/* ══════════════════════════════════════════════════════════════
   4. SALES PAGE AGENT
══════════════════════════════════════════════════════════════ */

export const SalesPageOutputSchema = z.object({
  headline:         z.string().min(10).max(200),
  subheadline:      z.string().max(300),
  hero_section:     z.object({
    hook_statement:    z.string(),
    problem_agitation: z.string(),
    solution_promise:  z.string(),
  }),
  benefits: z.array(z.object({
    title:       z.string(),
    description: z.string(),
    icon_suggestion: z.string(),
  })).min(3).max(10),
  social_proof: z.object({
    testimonial_prompts: z.array(z.string()).min(3),
    stat_claims:         z.array(z.string()).max(5),
    trust_badges:        z.array(z.string()).max(8),
  }),
  objection_handling: z.array(z.object({
    objection: z.string(),
    response:  z.string(),
  })).min(3).max(8),
  pricing_section: z.object({
    price_usd:        z.number().min(0),
    original_price:   z.number().optional(),
    payment_plans:    z.array(z.object({
      label:       z.string(),
      amount_usd:  z.number(),
      installments: z.number().int().optional(),
    })).max(3),
    guarantee:        z.string(),
    scarcity_element: z.string().optional(),
  }),
  cta_buttons: z.array(z.object({
    text:     z.string().max(50),
    subtext:  z.string().max(100).optional(),
    position: z.enum(['hero', 'mid_page', 'footer']),
  })).min(2).max(5),
  faq: z.array(z.object({
    question: z.string(),
    answer:   z.string(),
  })).min(3).max(10),
  seo_title:       z.string().max(60),
  seo_description: z.string().max(160),
  full_html:       z.string().optional(),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type SalesPageOutput = z.infer<typeof SalesPageOutputSchema>

/* ══════════════════════════════════════════════════════════════
   5. MARKETING AGENT (Content Fission Engine)
══════════════════════════════════════════════════════════════ */

const TwitterThreadSchema = z.object({
  hook:   z.string().max(280),
  tweets: z.array(z.string().max(280)).min(3).max(20),
  cta:    z.string().max(280),
})

const LinkedInCarouselSchema = z.object({
  title:  z.string().max(150),
  slides: z.array(z.object({
    slide_number: z.number().int(),
    headline:     z.string().max(100),
    body:         z.string().max(300),
  })).min(5).max(15),
  cover_image_prompt: z.string(),
})

export const MarketingOutputSchema = z.object({
  course_id: z.string().uuid(),
  twitter_threads: z.array(TwitterThreadSchema).length(3),
  linkedin_carousel: LinkedInCarouselSchema,
  short_form_video_scripts: z.array(z.object({
    platform:   z.enum(['tiktok', 'instagram_reels', 'youtube_shorts']),
    hook:       z.string().max(150),
    body:       z.string().max(500),
    cta:        z.string().max(100),
    duration_s: z.number().int().min(15).max(60),
  })).length(2),
  newsletter_intro: z.object({
    subject_line: z.string().max(80),
    preview_text: z.string().max(100),
    body:         z.string().min(100).max(1000),
  }),
  email_sequence: z.array(z.object({
    day:     z.number().int().min(0).max(14),
    subject: z.string().max(80),
    preview: z.string().max(100),
    body:    z.string().min(50),
    cta:     z.string(),
  })).min(5).max(10),
  ad_copy: z.array(z.object({
    platform:   z.enum(['facebook', 'google', 'instagram', 'youtube']),
    headline:   z.string().max(40),
    description: z.string().max(125),
    cta_button:  z.string().max(20),
  })).min(2).max(8),
  content_calendar: z.array(z.object({
    day:      z.number().int().min(1).max(30),
    platform: z.string(),
    content_type: z.string(),
    topic:    z.string(),
  })).min(14).max(30),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type MarketingOutput = z.infer<typeof MarketingOutputSchema>

/* ══════════════════════════════════════════════════════════════
   6. ANALYTICS AGENT
══════════════════════════════════════════════════════════════ */

export const AnalyticsOutputSchema = z.object({
  course_id: z.string().uuid(),
  kpi_snapshot: z.object({
    completion_rate:    Score100,
    avg_quiz_score:     Score100,
    engagement_rate:    Score100,
    total_enrollments:  z.number().int(),
    refund_rate:        Score100,
    nps_score:          z.number().min(-100).max(100).optional(),
    revenue_usd:        z.number().min(0),
  }),
  threshold_breaches: z.array(z.object({
    metric_name:    z.string(),
    actual_value:   z.number(),
    threshold_value: z.number(),
    recommendation: z.string(),
    priority:       Priority,
  })),
  cohort_analysis: z.array(z.object({
    cohort_month:       z.string(),
    enrollments:        z.number().int(),
    completions:        z.number().int(),
    completion_rate:    Score100,
    avg_revenue:        z.number(),
  })).max(12),
  top_performing_modules: z.array(z.object({
    module_title:  z.string(),
    completion_rate: Score100,
    avg_score:     Score100,
  })).max(5),
  drop_off_points: z.array(z.object({
    lesson_title:    z.string(),
    drop_off_rate:   Score100,
    probable_cause:  z.string(),
    recommendation:  z.string(),
  })).max(5),
  overall_readiness_score:  Score100,
  ready_to_publish:         z.boolean(),
  revenue_projection_90d:   z.number().min(0),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type AnalyticsOutput = z.infer<typeof AnalyticsOutputSchema>

/* ══════════════════════════════════════════════════════════════
   7. PUBLISHING AGENT
══════════════════════════════════════════════════════════════ */

export const PublishingOutputSchema = z.object({
  course_id: z.string().uuid(),
  platforms_published: z.array(z.object({
    platform:   z.enum(['teachable', 'thinkific', 'kajabi', 'udemy', 'gumroad', 'self_hosted']),
    url:        UrlString,
    status:     z.enum(['published', 'pending', 'failed']),
    listing_id: z.string().optional(),
    error:      z.string().optional(),
  })),
  launch_checklist: z.array(z.object({
    item:       z.string(),
    completed:  z.boolean(),
    notes:      z.string().optional(),
  })),
  launch_date:           z.string().datetime().optional(),
  promotional_start_date: z.string().datetime().optional(),
  total_platforms:       z.number().int(),
  successful_platforms:  z.number().int(),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type PublishingOutput = z.infer<typeof PublishingOutputSchema>

/* ══════════════════════════════════════════════════════════════
   8. PORTFOLIO MANAGER AGENT
══════════════════════════════════════════════════════════════ */

export const PortfolioManagerOutputSchema = z.object({
  user_id: z.string().uuid(),
  portfolio_summary: z.object({
    total_courses:       z.number().int(),
    total_revenue_usd:   z.number().min(0),
    total_enrollments:   z.number().int(),
    avg_completion_rate: Score100,
    portfolio_health:    z.enum(['poor', 'fair', 'good', 'excellent']),
  }),
  course_analyses: z.array(z.object({
    course_id:         z.string().uuid(),
    title:             z.string(),
    portfolio_score:   Score100,
    market_position:   z.enum(['leader', 'challenger', 'niche', 'commodity', 'declining']),
    growth_trajectory: z.enum(['growing', 'stable', 'declining', 'new']),
    recommended_action: z.enum(['invest', 'maintain', 'improve', 'retire', 'bundle']),
    rationale:         z.string(),
  })),
  cross_sell_opportunities: z.array(z.object({
    source_course_id: z.string().uuid(),
    target_course_id: z.string().uuid(),
    opportunity_type: z.enum(['upsell', 'cross_sell', 'bundle', 'sequence']),
    estimated_revenue: z.number().min(0),
    rationale:         z.string(),
  })).max(10),
  gap_courses: z.array(z.object({
    niche:             z.string(),
    opportunity_score: Score100,
    estimated_revenue: z.number().min(0),
    rationale:         z.string(),
  })).max(5),
  pricing_recommendations: z.array(z.object({
    course_id:        z.string().uuid(),
    current_price:    z.number(),
    recommended_price: z.number(),
    rationale:        z.string(),
  })).max(10),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type PortfolioManagerOutput = z.infer<typeof PortfolioManagerOutputSchema>

/* ══════════════════════════════════════════════════════════════
   9. REVENUE INTELLIGENCE AGENT
══════════════════════════════════════════════════════════════ */

export const RevenueIntelligenceOutputSchema = z.object({
  course_id: z.string().uuid(),
  revenue_summary: z.object({
    total_usd:        z.number().min(0),
    mrr_usd:          z.number().min(0),
    arr_projected:    z.number().min(0),
    refund_rate:      Score100,
    avg_order_value:  z.number().min(0),
    ltv_usd:          z.number().min(0),
  }),
  cohort_ltv: z.array(z.object({
    cohort_month:    z.string(),
    ltv_usd:         z.number().min(0),
    retention_rate:  Score100,
  })).max(12),
  pricing_experiments: z.array(z.object({
    variant_name:   z.string(),
    price_usd:      z.number(),
    conversion_rate: Score100,
    revenue_impact:  z.number(),
    recommendation: z.enum(['adopt', 'test_more', 'abandon']),
  })).max(5),
  churn_risks: z.array(z.object({
    risk_segment:   z.string(),
    probability:    Score100,
    revenue_at_risk: z.number().min(0),
    mitigation:     z.string(),
  })).max(5),
  revenue_levers: z.array(z.object({
    lever:          z.string(),
    current_value:  z.number(),
    target_value:   z.number(),
    expected_impact_usd: z.number(),
    effort:         z.enum(['low', 'medium', 'high']),
  })).max(8),
  forecast_30d:  z.number().min(0),
  forecast_90d:  z.number().min(0),
  forecast_365d: z.number().min(0),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type RevenueIntelligenceOutput = z.infer<typeof RevenueIntelligenceOutputSchema>

/* ══════════════════════════════════════════════════════════════
   10. SEO AGENT
══════════════════════════════════════════════════════════════ */

export const SEOOutputSchema = z.object({
  course_id: z.string().uuid(),
  primary_keyword:    z.string().max(100),
  secondary_keywords: z.array(z.string()).min(3).max(15),
  long_tail_keywords: z.array(z.string()).min(5).max(30),
  meta_title:         z.string().max(60),
  meta_description:   z.string().max(160),
  slug:               z.string().max(100).regex(/^[a-z0-9-]+$/),
  schema_markup: z.object({
    type:        z.literal('Course'),
    name:        z.string(),
    description: z.string(),
    provider:    z.object({ type: z.string(), name: z.string() }),
    offers:      z.object({ price: z.number(), priceCurrency: z.string() }).optional(),
    hasCourseInstance: z.array(z.object({
      courseMode: z.string(),
      instructor: z.string().optional(),
    })).optional(),
  }),
  content_optimization: z.array(z.object({
    page:        z.string(),
    current_h1:  z.string().optional(),
    recommended_h1: z.string(),
    keyword_density: z.number().min(0).max(10),
    improvements: z.array(z.string()),
  })).max(10),
  backlink_strategy: z.object({
    target_domains: z.array(z.string()).max(10),
    guest_post_opportunities: z.array(z.string()).max(5),
    resource_page_targets: z.array(z.string()).max(5),
  }),
  page_speed_recommendations: z.array(z.string()).max(10),
  competitor_gap_keywords: z.array(z.object({
    keyword:       z.string(),
    competitor:    z.string(),
    difficulty:    z.number().min(0).max(100),
    monthly_volume: z.number().int(),
  })).max(20),
  seo_score: Score100,
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type SEOOutput = z.infer<typeof SEOOutputSchema>

/* ══════════════════════════════════════════════════════════════
   11. CUSTOMER SUCCESS AGENT
══════════════════════════════════════════════════════════════ */

export const CustomerSuccessOutputSchema = z.object({
  course_id: z.string().uuid(),
  health_summary: z.object({
    total_students:       z.number().int(),
    active_students:      z.number().int(),
    at_risk_students:     z.number().int(),
    completion_rate:      Score100,
    avg_nps:              z.number().min(-100).max(100),
    support_ticket_rate:  Score100,
  }),
  at_risk_segments: z.array(z.object({
    segment_name:   z.string(),
    student_count:  z.number().int(),
    risk_level:     RiskLevel,
    trigger:        z.string(),
    days_inactive:  z.number().int().optional(),
  })).max(5),
  interventions: z.array(z.object({
    student_segment:   z.string(),
    risk_level:        RiskLevel,
    intervention_type: z.enum([
      'reminder_email', 'bonus_content', 'live_session', 'one_on_one',
      'community_nudge', 'refund_prevention', 'completion_push',
    ]),
    ai_message:  z.string().min(20).max(2000),
    trigger_reason: z.string(),
    expected_conversion_rate: Score100,
  })).min(1).max(10),
  course_improvement_suggestions: z.array(z.object({
    lesson_title:  z.string(),
    issue:         z.string(),
    recommendation: z.string(),
    priority:      Priority,
  })).max(10),
  nps_response_templates: z.array(z.object({
    score_range:  z.string(),
    response:     z.string(),
    follow_up:    z.string().optional(),
  })).max(5),
  success_milestones: z.array(z.object({
    milestone:    z.string(),
    trigger_at:   z.string(),
    celebration_message: z.string(),
  })).max(10),
  reasoning_trace: z.array(z.object({
    step:    z.number().int(),
    type:    z.enum(['analysis', 'decision', 'action', 'observation', 'conclusion']),
    content: z.string(),
  })),
})

export type CustomerSuccessOutput = z.infer<typeof CustomerSuccessOutputSchema>
