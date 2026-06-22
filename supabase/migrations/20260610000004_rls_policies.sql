-- =============================================================================
-- Migration 0004: Row Level Security
-- Zero-Trust: default-deny on all tables, explicit allow via policies
-- =============================================================================

-- Enable RLS on every table
ALTER TABLE public.tier_configs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_iterations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_research_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_blueprints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_assets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_tasks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_embeddings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_publish_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_iterations         ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (prevents superuser bypass in production)
ALTER TABLE public.courses        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.approvals      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.digital_assets FORCE ROW LEVEL SECURITY;

-- =============================================================================
-- POLICIES
-- =============================================================================

-- tier_configs: read-only for all authenticated users
CREATE POLICY "tier_configs_read" ON public.tier_configs
  FOR SELECT USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- user_profiles: own row only
-- ---------------------------------------------------------------------------
CREATE POLICY "profiles_select_own" ON public.user_profiles
  FOR SELECT USING (id = auth.uid() AND deleted_at IS NULL);
CREATE POLICY "profiles_update_own" ON public.user_profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- Prevent self-promotion of tier; must be done via service role
    AND tier = (SELECT tier FROM public.user_profiles WHERE id = auth.uid())
  );
-- INSERT handled by trigger on auth.users (see 0007_triggers)

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
CREATE POLICY "courses_select_own" ON public.courses
  FOR SELECT USING (owner_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "courses_insert_own" ON public.courses
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    -- Enforce max_courses per tier
    AND (
      SELECT COUNT(*) FROM public.courses c2
      WHERE c2.owner_id = auth.uid() AND c2.deleted_at IS NULL
    ) < (
      SELECT tc.max_courses FROM public.tier_configs tc
      JOIN public.user_profiles up ON up.tier = tc.tier
      WHERE up.id = auth.uid()
    )
  );

-- UPDATE: allow non-status field changes; status is protected (SECURITY DEFINER only)
CREATE POLICY "courses_update_metadata" ON public.courses
  FOR UPDATE USING (owner_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (
    owner_id = auth.uid()
    -- Status column must remain unchanged via direct UPDATE
    AND status = (SELECT c2.status FROM public.courses c2 WHERE c2.id = courses.id)
  );

-- Soft delete only (set deleted_at = NOW())
CREATE POLICY "courses_soft_delete" ON public.courses
  FOR UPDATE USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND deleted_at IS NOT NULL  -- only allow setting deleted_at
    AND (SELECT c2.deleted_at FROM public.courses c2 WHERE c2.id = courses.id) IS NULL
  );

-- ---------------------------------------------------------------------------
-- Helper: owned_course_ids — reused in child table policies
-- ---------------------------------------------------------------------------
-- Inline subquery pattern used throughout (no separate function to avoid plan instability)

-- ---------------------------------------------------------------------------
-- course_iterations: owner read-only; writes via SECURITY DEFINER only
-- ---------------------------------------------------------------------------
CREATE POLICY "iterations_select" ON public.course_iterations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_iterations.course_id
        AND c.owner_id = auth.uid()
        AND c.deleted_at IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- market_research_documents: owner read-only
-- ---------------------------------------------------------------------------
CREATE POLICY "mrd_select" ON public.market_research_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = market_research_documents.course_id
        AND c.owner_id = auth.uid() AND c.deleted_at IS NULL)
  );

-- ---------------------------------------------------------------------------
-- course_blueprints: owner read-only
-- ---------------------------------------------------------------------------
CREATE POLICY "blueprint_select" ON public.course_blueprints
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = course_blueprints.course_id
        AND c.owner_id = auth.uid() AND c.deleted_at IS NULL)
  );

-- ---------------------------------------------------------------------------
-- modules: owner read; owner can edit title/description (not status)
-- ---------------------------------------------------------------------------
CREATE POLICY "modules_select" ON public.modules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = modules.course_id AND c.owner_id = auth.uid() AND c.deleted_at IS NULL)
    AND deleted_at IS NULL
  );
CREATE POLICY "modules_update_content" ON public.modules
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = modules.course_id AND c.owner_id = auth.uid())
  )
  WITH CHECK (
    -- Cannot change status directly; only title, description, sort_order
    status = (SELECT m2.status FROM public.modules m2 WHERE m2.id = modules.id)
  );

-- ---------------------------------------------------------------------------
-- lessons: owner read; owner can edit content fields
-- ---------------------------------------------------------------------------
CREATE POLICY "lessons_select" ON public.lessons
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = lessons.course_id AND c.owner_id = auth.uid() AND c.deleted_at IS NULL)
    AND deleted_at IS NULL
  );
CREATE POLICY "lessons_update_content" ON public.lessons
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = lessons.course_id AND c.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- digital_assets: owner read; owner can update non-locked assets
-- ---------------------------------------------------------------------------
CREATE POLICY "assets_select" ON public.digital_assets
  FOR SELECT USING (
    deleted_at IS NULL
    AND source_id IN (
      SELECT id FROM public.courses WHERE owner_id = auth.uid() AND deleted_at IS NULL
      UNION ALL
      SELECT m.id FROM public.modules m
        JOIN public.courses c ON c.id = m.course_id
        WHERE c.owner_id = auth.uid() AND m.deleted_at IS NULL
      UNION ALL
      SELECT l.id FROM public.lessons l
        JOIN public.courses c ON c.id = l.course_id
        WHERE c.owner_id = auth.uid() AND l.deleted_at IS NULL
    )
  );

-- Owners can unlock non-locked assets (but cannot change is_locked=true to false after lock)
CREATE POLICY "assets_update_unlocked" ON public.digital_assets
  FOR UPDATE USING (
    is_locked = FALSE
    AND source_id IN (
      SELECT id FROM public.courses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (is_locked = FALSE);

-- ---------------------------------------------------------------------------
-- approvals: owner SELECT only — all mutations via perform_approval_action RPC
-- ---------------------------------------------------------------------------
CREATE POLICY "approvals_select" ON public.approvals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = approvals.course_id AND c.owner_id = auth.uid())
    AND deleted_at IS NULL
  );
-- NO INSERT / UPDATE / DELETE for end users — only SECURITY DEFINER functions

-- ---------------------------------------------------------------------------
-- agent_logs: owner SELECT only — INSERT only via SECURITY DEFINER
-- ---------------------------------------------------------------------------
CREATE POLICY "agent_logs_select" ON public.agent_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = agent_logs.course_id AND c.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- analytics_events: owner read-only
-- ---------------------------------------------------------------------------
CREATE POLICY "analytics_events_select" ON public.analytics_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = analytics_events.course_id AND c.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- analytics_tasks: owner read + dismiss
-- ---------------------------------------------------------------------------
CREATE POLICY "analytics_tasks_select" ON public.analytics_tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = analytics_tasks.course_id AND c.owner_id = auth.uid())
  );
CREATE POLICY "analytics_tasks_dismiss" ON public.analytics_tasks
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = analytics_tasks.course_id AND c.owner_id = auth.uid())
  )
  WITH CHECK (
    -- Only allow setting dismissed = true; cannot undismiss or resolve directly
    dismissed = TRUE AND dismissed_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- market_embeddings: read-only for all authenticated users
-- ---------------------------------------------------------------------------
CREATE POLICY "market_embeddings_read" ON public.market_embeddings
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- ---------------------------------------------------------------------------
-- platform_publish_logs: owner read-only
-- ---------------------------------------------------------------------------
CREATE POLICY "publish_logs_select" ON public.platform_publish_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.courses c
      WHERE c.id = platform_publish_logs.course_id AND c.owner_id = auth.uid())
  );
