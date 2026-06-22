-- =============================================================================
-- Migration 0003: Indexes
-- All performance-critical query patterns covered
-- =============================================================================

-- user_profiles
CREATE INDEX idx_user_profiles_tier ON public.user_profiles(tier) WHERE deleted_at IS NULL;

-- courses
CREATE INDEX idx_courses_owner_status  ON public.courses(owner_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_status        ON public.courses(status)           WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_slug          ON public.courses(slug)             WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_title_trgm    ON public.courses USING gin(title extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- course_iterations
CREATE INDEX idx_course_iter_course    ON public.course_iterations(course_id, version DESC)
  WHERE deleted_at IS NULL;

-- market_research_documents
CREATE INDEX idx_mrd_course_active     ON public.market_research_documents(course_id)
  WHERE deleted_at IS NULL AND is_active = TRUE;

-- course_blueprints
CREATE INDEX idx_blueprint_course_active ON public.course_blueprints(course_id)
  WHERE deleted_at IS NULL AND is_active = TRUE;

-- modules
CREATE INDEX idx_modules_course_order  ON public.modules(course_id, sort_order)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_modules_course_mvc    ON public.modules(course_id, is_mvc)
  WHERE deleted_at IS NULL AND is_mvc = TRUE;

-- lessons
CREATE INDEX idx_lessons_module_order  ON public.lessons(module_id, sort_order)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_lessons_course        ON public.lessons(course_id)
  WHERE deleted_at IS NULL;

-- digital_assets
CREATE INDEX idx_da_source             ON public.digital_assets(source_type, source_id)
  WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_da_source_type        ON public.digital_assets(source_id, asset_type)
  WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_da_platform           ON public.digital_assets(platform_target, asset_type)
  WHERE deleted_at IS NULL AND is_active = TRUE;
CREATE INDEX idx_da_embedding          ON public.digital_assets
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- approvals
CREATE INDEX idx_approvals_course_pending ON public.approvals(course_id)
  WHERE deleted_at IS NULL AND action IS NULL;
CREATE INDEX idx_approvals_course_stage ON public.approvals(course_id, approval_stage)
  WHERE deleted_at IS NULL;

-- agent_logs
CREATE INDEX idx_agent_logs_course_time  ON public.agent_logs(course_id, created_at DESC);
CREATE INDEX idx_agent_logs_event_time   ON public.agent_logs(event_type, created_at DESC);
CREATE INDEX idx_agent_logs_agent_error  ON public.agent_logs(agent, event_type)
  WHERE event_type = 'error';

-- analytics_events
CREATE INDEX idx_analytics_course_date  ON public.analytics_events(course_id, window_date DESC);
CREATE INDEX idx_analytics_unfired      ON public.analytics_events(course_id, trigger_fired)
  WHERE trigger_fired = FALSE;
CREATE INDEX idx_analytics_module       ON public.analytics_events(module_id, metric_name)
  WHERE module_id IS NOT NULL;

-- analytics_tasks
CREATE INDEX idx_analytics_tasks_course ON public.analytics_tasks(course_id, resolved, dismissed)
  WHERE resolved = FALSE AND dismissed = FALSE;

-- market_embeddings
CREATE INDEX idx_market_emb_vector      ON public.market_embeddings
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX idx_market_emb_niche       ON public.market_embeddings USING gin(niche_tags);
CREATE INDEX idx_market_emb_expires     ON public.market_embeddings(expires_at)
  WHERE expires_at IS NOT NULL;

-- platform_publish_logs
CREATE INDEX idx_publish_logs_course    ON public.platform_publish_logs(course_id, created_at DESC);
