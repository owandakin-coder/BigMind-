-- ============================================================
-- Migration 0010 — Extended Agent Support
-- Adds 4 auxiliary agents + their dedicated tables
-- ============================================================

-- ── Extend agent_name ENUM ──────────────────────────────────
ALTER TYPE public.agent_name ADD VALUE IF NOT EXISTS 'portfolio_manager_agent';
ALTER TYPE public.agent_name ADD VALUE IF NOT EXISTS 'revenue_intelligence_agent';
ALTER TYPE public.agent_name ADD VALUE IF NOT EXISTS 'seo_agent';
ALTER TYPE public.agent_name ADD VALUE IF NOT EXISTS 'customer_success_agent';

-- ── Extend course_status for post-publish states ────────────
ALTER TYPE public.course_status ADD VALUE IF NOT EXISTS 'seo_optimization';
ALTER TYPE public.course_status ADD VALUE IF NOT EXISTS 'portfolio_sync';
ALTER TYPE public.course_status ADD VALUE IF NOT EXISTS 'revenue_analysis';
ALTER TYPE public.course_status ADD VALUE IF NOT EXISTS 'customer_success_active';

-- ── portfolio_courses ───────────────────────────────────────
-- Tracks the creator's full course catalog for portfolio intelligence
CREATE TABLE IF NOT EXISTS public.portfolio_courses (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id         UUID        REFERENCES public.courses(id) ON DELETE SET NULL,
  title             TEXT        NOT NULL,
  niche             TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'draft',
  revenue_usd       NUMERIC(12,2) NOT NULL DEFAULT 0,
  enrollments       INTEGER     NOT NULL DEFAULT 0,
  avg_rating        NUMERIC(3,2),
  completion_rate   NUMERIC(5,2),
  published_at      TIMESTAMPTZ,
  last_analyzed_at  TIMESTAMPTZ,
  portfolio_score   INTEGER     CHECK (portfolio_score BETWEEN 0 AND 100),
  market_position   TEXT,
  cross_sell_targets UUID[]     DEFAULT '{}',
  metadata          JSONB       NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_user     ON public.portfolio_courses(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_course   ON public.portfolio_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_score    ON public.portfolio_courses(portfolio_score DESC);
CREATE INDEX IF NOT EXISTS idx_portfolio_niche    ON public.portfolio_courses(niche);

-- ── revenue_events ──────────────────────────────────────────
-- Granular revenue tracking per course enrollment
CREATE TABLE IF NOT EXISTS public.revenue_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL CHECK (event_type IN ('enrollment','refund','upsell','affiliate','bundle')),
  amount_usd      NUMERIC(12,2) NOT NULL,
  currency        TEXT        NOT NULL DEFAULT 'USD',
  platform        TEXT,
  student_id      TEXT,       -- anonymized external student ID
  cohort_month    TEXT,       -- YYYY-MM for cohort analysis
  ltv_segment     TEXT        CHECK (ltv_segment IN ('low','medium','high','vip')),
  referral_source TEXT,
  metadata        JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_course      ON public.revenue_events(course_id);
CREATE INDEX IF NOT EXISTS idx_revenue_user        ON public.revenue_events(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_event_type  ON public.revenue_events(event_type);
CREATE INDEX IF NOT EXISTS idx_revenue_cohort      ON public.revenue_events(cohort_month);
CREATE INDEX IF NOT EXISTS idx_revenue_created     ON public.revenue_events(created_at DESC);
-- Partial: refunds only
CREATE INDEX IF NOT EXISTS idx_revenue_refunds     ON public.revenue_events(course_id)
  WHERE event_type = 'refund';

-- ── seo_metadata ────────────────────────────────────────────
-- SEO analysis and optimization data per course
CREATE TABLE IF NOT EXISTS public.seo_metadata (
  id                  UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID      NOT NULL UNIQUE REFERENCES public.courses(id) ON DELETE CASCADE,
  primary_keyword     TEXT      NOT NULL,
  secondary_keywords  TEXT[]    NOT NULL DEFAULT '{}',
  long_tail_keywords  TEXT[]    NOT NULL DEFAULT '{}',
  meta_title          TEXT      NOT NULL,
  meta_description    TEXT      NOT NULL,
  slug                TEXT      NOT NULL,
  schema_markup       JSONB     NOT NULL DEFAULT '{}',
  page_speed_score    INTEGER   CHECK (page_speed_score BETWEEN 0 AND 100),
  seo_score           INTEGER   CHECK (seo_score BETWEEN 0 AND 100),
  backlink_strategy   TEXT,
  content_gaps        TEXT[]    NOT NULL DEFAULT '{}',
  competitor_keywords JSONB     NOT NULL DEFAULT '{}',
  search_volume_data  JSONB     NOT NULL DEFAULT '{}',
  rank_tracking       JSONB     NOT NULL DEFAULT '{}',
  last_audit_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seo_course      ON public.seo_metadata(course_id);
CREATE INDEX IF NOT EXISTS idx_seo_keyword     ON public.seo_metadata(primary_keyword);
CREATE INDEX IF NOT EXISTS idx_seo_score       ON public.seo_metadata(seo_score DESC);

-- ── customer_success_events ─────────────────────────────────
-- Post-publish student engagement and success tracking
CREATE TABLE IF NOT EXISTS public.customer_success_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id      TEXT        NOT NULL,  -- anonymized
  event_type      TEXT        NOT NULL CHECK (event_type IN (
    'lesson_completed','module_completed','course_completed',
    'quiz_passed','quiz_failed','support_ticket','nps_response',
    'refund_requested','re_enrollment','certificate_earned',
    'community_post','feedback_submitted'
  )),
  event_value     NUMERIC,    -- score, NPS value, etc.
  metadata        JSONB       NOT NULL DEFAULT '{}',
  cohort_month    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_course       ON public.customer_success_events(course_id);
CREATE INDEX IF NOT EXISTS idx_cs_student      ON public.customer_success_events(student_id);
CREATE INDEX IF NOT EXISTS idx_cs_event_type   ON public.customer_success_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cs_created      ON public.customer_success_events(created_at DESC);
-- Partial: completions for funnel analysis
CREATE INDEX IF NOT EXISTS idx_cs_completions  ON public.customer_success_events(course_id, cohort_month)
  WHERE event_type IN ('lesson_completed','module_completed','course_completed');

-- ── customer_success_interventions ─────────────────────────
-- AI-generated interventions for at-risk students
CREATE TABLE IF NOT EXISTS public.customer_success_interventions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id      TEXT        NOT NULL,
  risk_level      TEXT        NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  intervention_type TEXT      NOT NULL CHECK (intervention_type IN (
    'reminder_email','bonus_content','live_session','one_on_one',
    'community_nudge','refund_prevention','completion_push'
  )),
  trigger_reason  TEXT        NOT NULL,
  ai_message      TEXT,
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  acted_at        TIMESTAMPTZ,
  outcome         TEXT        CHECK (outcome IN ('converted','ignored','refunded','completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_int_course    ON public.customer_success_interventions(course_id);
CREATE INDEX IF NOT EXISTS idx_cs_int_student   ON public.customer_success_interventions(student_id);
CREATE INDEX IF NOT EXISTS idx_cs_int_risk      ON public.customer_success_interventions(risk_level);

-- ── RLS for new tables ──────────────────────────────────────
ALTER TABLE public.portfolio_courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_events                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_metadata                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_success_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_success_interventions  ENABLE ROW LEVEL SECURITY;

-- portfolio_courses: user owns their portfolio
CREATE POLICY portfolio_select ON public.portfolio_courses
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY portfolio_insert ON public.portfolio_courses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY portfolio_update ON public.portfolio_courses
  FOR UPDATE USING (auth.uid() = user_id);

-- revenue_events: user sees own course revenue
CREATE POLICY revenue_select ON public.revenue_events
  FOR SELECT USING (
    auth.uid() = user_id OR
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid())
  );

-- seo_metadata: user owns their course SEO
CREATE POLICY seo_select ON public.seo_metadata
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid())
  );
CREATE POLICY seo_insert ON public.seo_metadata
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid())
  );
CREATE POLICY seo_update ON public.seo_metadata
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid())
  );

-- customer_success: user sees own course data
CREATE POLICY cs_events_select ON public.customer_success_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid())
  );
CREATE POLICY cs_interventions_select ON public.customer_success_interventions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.owner_id = auth.uid())
  );

-- ── Realtime publications for new tables ─────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.revenue_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_success_interventions;

-- ── State machine: validate_state_transition is defined in 0005 ────────
-- Migration 0005 already covers all 21 course_status enum values correctly.
-- The post-publish auxiliary states (live_analytics, paused, archived) are
-- also handled in migration 0005. No override needed here.

-- ── Updated cron: detect stuck workflows includes new states ─
-- (The existing detect-stuck-workflows cron already uses the agent-run states list;
--  new auxiliary states are intentionally excluded from stuck detection as they
--  are long-running background jobs.)

COMMENT ON TABLE public.portfolio_courses IS
  'Creator portfolio intelligence — tracks all courses for cross-sell, upsell, and market positioning analysis';
COMMENT ON TABLE public.revenue_events IS
  'Granular revenue event log per course for LTV, cohort, and refund analysis';
COMMENT ON TABLE public.seo_metadata IS
  'AI-generated SEO optimization data: keywords, meta tags, schema markup, rank tracking';
COMMENT ON TABLE public.customer_success_events IS
  'Post-publish student engagement events for dropout prediction and intervention';
COMMENT ON TABLE public.customer_success_interventions IS
  'AI-generated student retention interventions: emails, bonus content, nudges';
