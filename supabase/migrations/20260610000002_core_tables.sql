-- =============================================================================
-- Migration 0002: Core Tables
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SUBSCRIPTION TIER CONFIGS — source of truth for credit caps
-- ---------------------------------------------------------------------------
CREATE TABLE public.tier_configs (
  tier            public.subscription_tier PRIMARY KEY,
  ai_credits_cap  INTEGER NOT NULL,         -- -1 = unlimited
  max_courses     INTEGER NOT NULL DEFAULT 3,
  max_modules_per_course INTEGER NOT NULL DEFAULT 7,
  concurrent_agents INTEGER NOT NULL DEFAULT 1,
  features        TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- USER PROFILES
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name          TEXT NOT NULL,
  avatar_url            TEXT,
  tier                  public.subscription_tier NOT NULL DEFAULT 'free'
                          REFERENCES public.tier_configs(tier),
  ai_credits_used       INTEGER NOT NULL DEFAULT 0 CHECK (ai_credits_used >= 0),
  billing_cycle_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- COURSES
-- ---------------------------------------------------------------------------
CREATE TABLE public.courses (
  id                    UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id              UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  slug                  TEXT UNIQUE,
  course_idea           TEXT NOT NULL CHECK (char_length(course_idea) > 10),
  target_niche          TEXT NOT NULL,
  creator_goals         TEXT,
  status                public.course_status NOT NULL DEFAULT 'draft',
  platform_target       public.platform_target NOT NULL DEFAULT 'internal',
  current_version       NUMERIC(4,1) NOT NULL DEFAULT 1.0 CHECK (current_version > 0),
  -- Concurrency config
  parallel_content_gen  BOOLEAN NOT NULL DEFAULT TRUE,
  auto_approve_content  BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lock flags (set by approve_and_lock action)
  market_report_locked  BOOLEAN NOT NULL DEFAULT FALSE,
  blueprint_locked      BOOLEAN NOT NULL DEFAULT FALSE,
  sales_copy_locked     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Soft delete
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- COURSE ITERATIONS (version snapshots)
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_iterations (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  version         NUMERIC(4,1) NOT NULL CHECK (version > 0),
  snapshot_json   JSONB NOT NULL,
  change_summary  TEXT,
  triggered_by    TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (course_id, version)
);

-- ---------------------------------------------------------------------------
-- MARKET RESEARCH DOCUMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE public.market_research_documents (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id           UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  version             NUMERIC(4,1) NOT NULL DEFAULT 1.0,
  demand_score        SMALLINT CHECK (demand_score BETWEEN 0 AND 100),
  opportunity_score   SMALLINT CHECK (opportunity_score BETWEEN 0 AND 100),
  competition_score   SMALLINT CHECK (competition_score BETWEEN 0 AND 100),
  competitor_analysis JSONB NOT NULL DEFAULT '[]',
  pricing_analysis    JSONB NOT NULL DEFAULT '{}',
  seo_keywords        TEXT[] NOT NULL DEFAULT '{}',
  risk_matrix         JSONB NOT NULL DEFAULT '[]',
  pivot_options       JSONB NOT NULL DEFAULT '[]',
  pivot_triggered     BOOLEAN NOT NULL DEFAULT FALSE,
  rag_context_ids     UUID[] NOT NULL DEFAULT '{}',
  agent_version       TEXT NOT NULL DEFAULT '1.0',
  generation_ms       INTEGER,
  raw_llm_output      TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- COURSE BLUEPRINTS
-- ---------------------------------------------------------------------------
CREATE TABLE public.course_blueprints (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id           UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  market_report_id    UUID NOT NULL REFERENCES public.market_research_documents(id),
  version             NUMERIC(4,1) NOT NULL DEFAULT 1.0,
  learning_outcomes   TEXT[] NOT NULL DEFAULT '{}',
  total_modules       INTEGER NOT NULL DEFAULT 0 CHECK (total_modules >= 0),
  total_lessons       INTEGER NOT NULL DEFAULT 0 CHECK (total_lessons >= 0),
  estimated_hours     NUMERIC(5,1) CHECK (estimated_hours > 0),
  difficulty_level    TEXT CHECK (difficulty_level IN ('beginner','intermediate','advanced')),
  core_framework      JSONB NOT NULL DEFAULT '[]',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- MODULES
-- ---------------------------------------------------------------------------
CREATE TABLE public.modules (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  blueprint_id    UUID REFERENCES public.course_blueprints(id) ON DELETE SET NULL,
  title           TEXT NOT NULL CHECK (char_length(title) > 0),
  description     TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  pain_point_ref  TEXT,
  is_mvc          BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','generating','review','approved','published')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (course_id, sort_order)  -- enforces module ordering integrity
);

-- ---------------------------------------------------------------------------
-- LESSONS
-- ---------------------------------------------------------------------------
CREATE TABLE public.lessons (
  id                      UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  module_id               UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  course_id               UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL CHECK (char_length(title) > 0),
  sort_order              INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  context_hook            TEXT,
  observation_concept     TEXT,
  reflection_exercise     TEXT,
  evaluation_quiz_asset_id UUID,  -- FK set post-insert after digital_assets created
  estimated_minutes       INTEGER NOT NULL DEFAULT 10 CHECK (estimated_minutes > 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ,
  UNIQUE (module_id, sort_order)
);

-- ---------------------------------------------------------------------------
-- DIGITAL ASSETS (polymorphic)
-- ---------------------------------------------------------------------------
CREATE TABLE public.digital_assets (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  source_type     public.asset_source_type NOT NULL,
  source_id       UUID NOT NULL,
  asset_type      public.asset_type NOT NULL,
  content_format  public.content_format,
  title           TEXT,
  content_text    TEXT,
  content_url     TEXT,
  content_json    JSONB,
  mime_type       TEXT,
  file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
  storage_path    TEXT,
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  platform_target public.platform_target,
  ab_variant      TEXT CHECK (ab_variant IN ('A','B')),
  embedding       extensions.vector(1536),
  generated_by    public.agent_name,
  generation_ms   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- APPROVALS
-- ---------------------------------------------------------------------------
CREATE TABLE public.approvals (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  approval_stage  TEXT NOT NULL,
  target_type     TEXT NOT NULL CHECK (target_type IN
                    ('market_report','blueprint','module','sales_copy','full_course')),
  target_id       UUID NOT NULL,
  reviewer_id     UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action          public.approval_action,
  feedback        TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  is_pending      BOOLEAN NOT NULL GENERATED ALWAYS AS
                    (action IS NULL) STORED,  -- computed: pending = no action taken yet
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- AGENT LOGS (immutable audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE public.agent_logs (
  id                UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id         UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  agent             public.agent_name NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'execution_start','execution_complete','error',
                      'state_transition','hitl_request','hitl_response',
                      'regeneration_triggered','pivot_triggered','cost_ceiling_hit'
                    )),
  from_status       public.course_status,
  to_status         public.course_status,
  reasoning_trace   JSONB NOT NULL DEFAULT '[]',
  model_used        TEXT,
  prompt_tokens     INTEGER CHECK (prompt_tokens >= 0),
  completion_tokens INTEGER CHECK (completion_tokens >= 0),
  total_cost_usd    NUMERIC(10,6) CHECK (total_cost_usd >= 0),
  error_code        TEXT,
  error_message     TEXT,
  actor_id          TEXT NOT NULL,
  -- No updated_at / deleted_at — this table is IMMUTABLE
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- ANALYTICS EVENTS (upsertable aggregations)
-- ---------------------------------------------------------------------------
CREATE TABLE public.analytics_events (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id       UUID REFERENCES public.modules(id) ON DELETE SET NULL,
  lesson_id       UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  metric_name     TEXT NOT NULL CHECK (metric_name IN (
                    'enrollment','module_completion','lesson_dropoff',
                    'sales_conversion','refund','quiz_pass_rate',
                    'page_view','avg_watch_time'
                  )),
  metric_value    NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (metric_value >= 0),
  sample_count    INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  window_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  trigger_fired   BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_type    TEXT CHECK (trigger_type IN ('redesign','content_gap','simplify','harmonize')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, module_id, lesson_id, metric_name, window_date)
);

-- ---------------------------------------------------------------------------
-- MARKET EMBEDDINGS (RAG knowledge base)
-- ---------------------------------------------------------------------------
CREATE TABLE public.market_embeddings (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  source_url      TEXT,
  source_label    TEXT NOT NULL,
  content         TEXT NOT NULL CHECK (char_length(content) > 0),
  embedding       extensions.vector(1536) NOT NULL,
  niche_tags      TEXT[] NOT NULL DEFAULT '{}',
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- PLATFORM PUBLISH LOGS
-- ---------------------------------------------------------------------------
CREATE TABLE public.platform_publish_logs (
  id                  UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id           UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  platform            public.platform_target NOT NULL,
  status              TEXT NOT NULL DEFAULT 'dry_run'
                        CHECK (status IN ('dry_run','pending','success','failed')),
  platform_course_id  TEXT,
  platform_url        TEXT,
  dry_run_report      JSONB,
  error_detail        TEXT,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- ANALYTICS TRIGGER TASKS (generated by analytics_agent)
-- ---------------------------------------------------------------------------
CREATE TABLE public.analytics_tasks (
  id              UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('redesign','content_gap','simplify','harmonize')),
  target_agent    public.agent_name NOT NULL,
  target_entity_id UUID,
  message         TEXT NOT NULL,
  priority        TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  metric_name     TEXT NOT NULL,
  metric_value    NUMERIC(10,4) NOT NULL,
  threshold       NUMERIC(10,4) NOT NULL,
  dismissed       BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_by    UUID REFERENCES public.user_profiles(id),
  dismissed_at    TIMESTAMPTZ,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
