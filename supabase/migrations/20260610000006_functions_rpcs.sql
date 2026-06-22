-- =============================================================================
-- Migration 0006: Application RPCs
-- All functions called by Edge Functions or directly by frontend
-- =============================================================================

-- ---------------------------------------------------------------------------
-- check_and_deduct_credits — called before every AI generation
-- Returns: TRUE if credits available and deducted; FALSE if capped
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_and_deduct_credits(
  p_user_id    UUID,
  p_cost_units INTEGER DEFAULT 1
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_profile   public.user_profiles%ROWTYPE;
  v_cap       INTEGER;
BEGIN
  -- Lock row
  SELECT up.* INTO v_profile
  FROM public.user_profiles up
  WHERE up.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id USING ERRCODE = 'P0001';
  END IF;

  -- Get cap from tier_configs
  SELECT tc.ai_credits_cap INTO v_cap
  FROM public.tier_configs tc
  WHERE tc.tier = v_profile.tier;

  -- Enterprise: unlimited (cap = -1)
  IF v_cap = -1 THEN
    RETURN TRUE;
  END IF;

  -- Reset billing cycle if expired (monthly)
  IF NOW() > v_profile.billing_cycle_start + INTERVAL '30 days' THEN
    UPDATE public.user_profiles
    SET ai_credits_used = 0, billing_cycle_start = NOW()
    WHERE id = p_user_id;
    v_profile.ai_credits_used := 0;
  END IF;

  -- Check cap
  IF (v_profile.ai_credits_used + p_cost_units) > v_cap THEN
    RETURN FALSE;
  END IF;

  -- Deduct atomically
  UPDATE public.user_profiles
  SET ai_credits_used = ai_credits_used + p_cost_units
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- match_market_embeddings — RAG similarity search (pgvector)
-- Called by AI Gateway to fetch market context before LLM calls
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_market_embeddings(
  query_embedding extensions.vector(1536),
  match_threshold FLOAT DEFAULT 0.70,
  match_count     INTEGER DEFAULT 5,
  filter_niche    TEXT DEFAULT NULL
) RETURNS TABLE (
  id            UUID,
  source_label  TEXT,
  content       TEXT,
  niche_tags    TEXT[],
  similarity    FLOAT,
  scraped_at    TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.id,
    me.source_label,
    me.content,
    me.niche_tags,
    1 - (me.embedding <=> query_embedding) AS similarity,
    me.scraped_at
  FROM public.market_embeddings me
  WHERE
    (me.expires_at IS NULL OR me.expires_at > NOW())
    AND (filter_niche IS NULL OR me.niche_tags @> ARRAY[filter_niche])
    AND 1 - (me.embedding <=> query_embedding) > match_threshold
  ORDER BY me.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- upsert_analytics_metric — called by analytics webhook receiver
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_analytics_metric(
  p_course_id   UUID,
  p_module_id   UUID,
  p_lesson_id   UUID,
  p_metric_name TEXT,
  p_value       NUMERIC,
  p_count       INTEGER DEFAULT 1,
  p_date        DATE DEFAULT CURRENT_DATE
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.analytics_events (
    course_id, module_id, lesson_id, metric_name,
    metric_value, sample_count, window_date
  ) VALUES (
    p_course_id, p_module_id, p_lesson_id, p_metric_name,
    p_value, p_count, p_date
  )
  ON CONFLICT (course_id, module_id, lesson_id, metric_name, window_date)
  DO UPDATE SET
    -- Rolling average
    metric_value  = (analytics_events.metric_value * analytics_events.sample_count + EXCLUDED.metric_value)
                    / (analytics_events.sample_count + EXCLUDED.sample_count),
    sample_count  = analytics_events.sample_count + EXCLUDED.sample_count,
    updated_at    = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_pending_approvals — fetches current pending approvals for a course
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_approvals(p_course_id UUID)
RETURNS TABLE (
  approval_id     UUID,
  approval_stage  TEXT,
  target_type     TEXT,
  target_id       UUID,
  requested_at    TIMESTAMPTZ,
  course_status   public.course_status
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = p_course_id AND owner_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.approval_stage,
    a.target_type,
    a.target_id,
    a.requested_at,
    c.status
  FROM public.approvals a
  JOIN public.courses c ON c.id = a.course_id
  WHERE a.course_id = p_course_id
    AND a.action IS NULL
    AND a.deleted_at IS NULL
  ORDER BY a.requested_at ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_audit_trail — sanitized, time-sorted log for UI display
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_audit_trail(p_course_id UUID)
RETURNS TABLE (
  log_id            UUID,
  event_type        TEXT,
  agent             TEXT,
  from_status       TEXT,
  to_status         TEXT,
  reasoning_trace   JSONB,
  model_used        TEXT,
  total_cost_usd    NUMERIC,
  actor_display     TEXT,
  created_at        TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.courses
    WHERE id = p_course_id AND owner_id = auth.uid() AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.event_type,
    al.agent::TEXT,
    al.from_status::TEXT,
    al.to_status::TEXT,
    al.reasoning_trace,
    al.model_used,
    al.total_cost_usd,
    -- Sanitize: mask UUIDs, keep agent names as-is
    CASE
      WHEN al.actor_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-' THEN 'creator'
      ELSE al.actor_id
    END AS actor_display,
    al.created_at
  FROM public.agent_logs al
  WHERE al.course_id = p_course_id
  ORDER BY al.created_at ASC;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_course_dashboard — single RPC for the frontend dashboard query
-- Returns course + active approval + latest agent log + credit summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_course_dashboard(p_course_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_course      public.courses%ROWTYPE;
  v_approval    public.approvals%ROWTYPE;
  v_last_log    public.agent_logs%ROWTYPE;
  v_credits     RECORD;
  v_open_tasks  INTEGER;
BEGIN
  SELECT * INTO v_course FROM public.courses
  WHERE id = p_course_id AND owner_id = auth.uid() AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_approval FROM public.approvals
  WHERE course_id = p_course_id AND action IS NULL AND deleted_at IS NULL
  ORDER BY requested_at DESC LIMIT 1;

  SELECT * INTO v_last_log FROM public.agent_logs
  WHERE course_id = p_course_id ORDER BY created_at DESC LIMIT 1;

  SELECT
    up.ai_credits_used,
    tc.ai_credits_cap,
    ROUND(100.0 * up.ai_credits_used / NULLIF(tc.ai_credits_cap, -1), 1) AS usage_pct
  INTO v_credits
  FROM public.user_profiles up
  JOIN public.tier_configs tc ON tc.tier = up.tier
  WHERE up.id = auth.uid();

  SELECT COUNT(*) INTO v_open_tasks FROM public.analytics_tasks
  WHERE course_id = p_course_id AND resolved = FALSE AND dismissed = FALSE;

  RETURN jsonb_build_object(
    'course',           row_to_json(v_course),
    'pending_approval', CASE WHEN v_approval.id IS NOT NULL THEN row_to_json(v_approval) ELSE NULL END,
    'last_agent_event', CASE WHEN v_last_log.id IS NOT NULL THEN row_to_json(v_last_log)  ELSE NULL END,
    'credits',          row_to_json(v_credits),
    'open_tasks',       v_open_tasks
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- dismiss_analytics_task — soft-dismiss with reason
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dismiss_analytics_task(
  p_task_id UUID,
  p_reason  TEXT DEFAULT NULL
) RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.analytics_tasks
  SET
    dismissed    = TRUE,
    dismissed_by = auth.uid(),
    dismissed_at = NOW(),
    updated_at   = NOW()
  WHERE id = p_task_id
    AND dismissed = FALSE
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = analytics_tasks.course_id AND c.owner_id = auth.uid()
    );

  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- launch_course_workflow — user-facing RPC to start the pipeline from draft
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.launch_course_workflow(p_course_id UUID)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_course public.courses%ROWTYPE;
BEGIN
  SELECT * INTO v_course FROM public.courses
  WHERE id = p_course_id AND owner_id = auth.uid() AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found_or_unauthorized' USING ERRCODE = 'P0001';
  END IF;

  IF v_course.status != 'draft' THEN
    RAISE EXCEPTION 'course_not_in_draft_status: %', v_course.status USING ERRCODE = 'P0001';
  END IF;

  -- Transition to market_research — this fires the DB webhook → n8n
  PERFORM public.transition_course_status(
    p_course_id, 'market_research'::public.course_status,
    auth.uid()::TEXT,
    '{"rationale": "User launched course workflow", "agent": "market_research_agent"}'::JSONB
  );

  RETURN jsonb_build_object('success', TRUE, 'new_status', 'market_research');
END;
$$;
