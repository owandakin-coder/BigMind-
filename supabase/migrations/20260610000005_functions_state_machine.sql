-- =============================================================================
-- Migration 0005: State Machine Functions
-- Core transition logic — single source of truth for ALL status changes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- validate_state_transition — mirrors TypeScript VALID_TRANSITIONS exactly
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_state_transition(
  p_from public.course_status,
  p_to   public.course_status
) RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE  -- same inputs always produce same output
AS $$
BEGIN
  RETURN CASE p_from
    WHEN 'draft'                  THEN p_to IN ('market_research')
    WHEN 'market_research'        THEN p_to IN ('market_review','failed')
    WHEN 'market_review'          THEN p_to IN ('market_rejected','architecture_design')
    WHEN 'market_rejected'        THEN p_to IN ('market_pivot','draft')
    WHEN 'market_pivot'           THEN p_to IN ('market_review')
    WHEN 'architecture_design'    THEN p_to IN ('architecture_review','failed')
    WHEN 'architecture_review'    THEN p_to IN ('architecture_rejected','content_generation')
    WHEN 'architecture_rejected'  THEN p_to IN ('architecture_design')
    WHEN 'content_generation'     THEN p_to IN ('content_review','sales_page_generation','failed')
    WHEN 'content_review'         THEN p_to IN ('content_generation','sales_page_generation')
    WHEN 'sales_page_generation'  THEN p_to IN ('sales_page_review','failed')
    WHEN 'sales_page_review'      THEN p_to IN ('sales_page_generation','marketing_prep')
    WHEN 'marketing_prep'         THEN p_to IN ('marketing_review','failed')
    WHEN 'marketing_review'       THEN p_to IN ('marketing_prep','final_approval_gate')
    WHEN 'final_approval_gate'    THEN p_to IN ('publishing','content_generation','sales_page_generation','marketing_prep')
    WHEN 'publishing'             THEN p_to IN ('live','failed')
    WHEN 'live'                   THEN p_to IN ('live_analytics','paused')
    WHEN 'live_analytics'         THEN p_to IN ('live','paused','content_generation')
    WHEN 'paused'                 THEN p_to IN ('live','archived')
    WHEN 'archived'               THEN p_to IN ('draft')
    WHEN 'failed'                 THEN p_to IN ('draft')
    ELSE FALSE
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- transition_course_status — the ONLY way to change course.status
-- Called by SECURITY DEFINER functions; blocked for direct user UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_course_status(
  p_course_id   UUID,
  p_new_status  public.course_status,
  p_actor_id    TEXT,
  p_metadata    JSONB DEFAULT '{}'
) RETURNS public.course_status
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_old_status public.course_status;
BEGIN
  -- Lock row for update
  SELECT status INTO v_old_status
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found: %', p_course_id USING ERRCODE = 'P0001';
  END IF;

  -- Guard: same status is a no-op (idempotent)
  IF v_old_status = p_new_status THEN
    RETURN p_new_status;
  END IF;

  -- Validate transition
  IF NOT public.validate_state_transition(v_old_status, p_new_status) THEN
    RAISE EXCEPTION 'invalid_state_transition: % -> % (course: %)',
      v_old_status, p_new_status, p_course_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Apply transition
  UPDATE public.courses
  SET status = p_new_status, updated_at = NOW()
  WHERE id = p_course_id;

  -- Immutable audit log
  INSERT INTO public.agent_logs (
    course_id, agent, event_type,
    from_status, to_status,
    reasoning_trace, actor_id
  ) VALUES (
    p_course_id,
    COALESCE((p_metadata->>'agent')::public.agent_name, 'market_research_agent'),
    'state_transition',
    v_old_status, p_new_status,
    jsonb_build_array(jsonb_build_object(
      'step', 1,
      'decision', format('Status transition: %s → %s', v_old_status, p_new_status),
      'rationale', COALESCE(p_metadata->>'rationale', 'Automated state machine transition'),
      'timestamp', NOW()
    )),
    p_actor_id
  );

  -- Auto-snapshot at FINAL_APPROVAL_GATE passage
  IF p_new_status = 'publishing' THEN
    PERFORM public.snapshot_course_version(p_course_id, p_actor_id);
  END IF;

  RETURN p_new_status;
END;
$$;

-- ---------------------------------------------------------------------------
-- perform_approval_action — the ONLY way for humans to advance/reject state
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.perform_approval_action(
  p_approval_id UUID,
  p_action      public.approval_action,
  p_feedback    TEXT DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_approval    public.approvals%ROWTYPE;
  v_course      public.courses%ROWTYPE;
  v_new_status  public.course_status;
  v_caller_id   UUID := auth.uid();
BEGIN
  -- Verify caller is authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;

  -- Load pending approval, verify course ownership atomically
  SELECT a.* INTO v_approval
  FROM public.approvals a
  JOIN public.courses c ON c.id = a.course_id
  WHERE a.id = p_approval_id
    AND c.owner_id = v_caller_id
    AND a.action IS NULL          -- still pending
    AND a.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval_not_found_or_unauthorized'
      USING ERRCODE = 'P0001', DETAIL = format('approval_id: %s, caller: %s', p_approval_id, v_caller_id);
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = v_approval.course_id;

  -- Resolve next status from action + current status
  v_new_status := CASE
    WHEN p_action IN ('approve', 'approve_and_lock') THEN
      CASE v_course.status
        WHEN 'market_review'       THEN 'architecture_design'::public.course_status
        WHEN 'architecture_review' THEN 'content_generation'::public.course_status
        WHEN 'content_review'      THEN 'sales_page_generation'::public.course_status
        WHEN 'sales_page_review'   THEN 'marketing_prep'::public.course_status
        WHEN 'marketing_review'    THEN 'final_approval_gate'::public.course_status
        WHEN 'final_approval_gate' THEN 'publishing'::public.course_status
        ELSE NULL
      END
    WHEN p_action = 'reject' THEN
      CASE v_course.status
        WHEN 'market_review'       THEN 'market_rejected'::public.course_status
        WHEN 'architecture_review' THEN 'architecture_rejected'::public.course_status
        WHEN 'content_review'      THEN 'content_generation'::public.course_status
        WHEN 'sales_page_review'   THEN 'sales_page_generation'::public.course_status
        WHEN 'marketing_review'    THEN 'marketing_prep'::public.course_status
        WHEN 'final_approval_gate' THEN v_course.status   -- stays; section re-queued
        ELSE NULL
      END
    WHEN p_action = 'pivot' THEN
      CASE v_course.status
        WHEN 'market_review' THEN 'market_pivot'::public.course_status
        WHEN 'market_rejected' THEN 'market_pivot'::public.course_status
        ELSE NULL
      END
    WHEN p_action = 'regenerate' THEN
      v_course.status   -- stays; agent will re-run at same status
    ELSE NULL
  END;

  IF v_new_status IS NULL THEN
    RAISE EXCEPTION 'no_transition_mapping: action=% status=%', p_action, v_course.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Apply lock if approve_and_lock
  IF p_action = 'approve_and_lock' THEN
    UPDATE public.courses SET
      market_report_locked = CASE WHEN v_course.status = 'market_review'
                                  THEN TRUE ELSE market_report_locked END,
      blueprint_locked     = CASE WHEN v_course.status = 'architecture_review'
                                  THEN TRUE ELSE blueprint_locked END,
      sales_copy_locked    = CASE WHEN v_course.status IN ('sales_page_review','final_approval_gate')
                                  THEN TRUE ELSE sales_copy_locked END
    WHERE id = v_course.id;

    -- Lock associated assets
    UPDATE public.digital_assets
    SET is_locked = TRUE
    WHERE source_id = v_course.id
      AND asset_type = CASE v_course.status
        WHEN 'market_review'       THEN 'lesson_script'
        WHEN 'sales_page_review'   THEN 'sales_copy'
        WHEN 'final_approval_gate' THEN 'sales_copy'
        ELSE NULL
      END
      AND deleted_at IS NULL;
  END IF;

  -- Stamp approval record
  UPDATE public.approvals SET
    action      = p_action,
    feedback    = p_feedback,
    reviewer_id = v_caller_id,
    reviewed_at = NOW(),
    updated_at  = NOW()
  WHERE id = p_approval_id;

  -- Transition state (only if new status differs from current)
  IF v_new_status != v_course.status THEN
    PERFORM public.transition_course_status(
      v_course.id, v_new_status, v_caller_id::TEXT,
      jsonb_build_object(
        'agent', 'market_research_agent',
        'rationale', format('Human action: %s. Feedback: %s', p_action, COALESCE(p_feedback, 'none'))
      )
    );
  ELSE
    -- regenerate: log hitl_response without status change
    INSERT INTO public.agent_logs (
      course_id, agent, event_type, from_status, to_status, reasoning_trace, actor_id
    ) VALUES (
      v_course.id, 'market_research_agent', 'hitl_response',
      v_course.status, v_course.status,
      jsonb_build_array(jsonb_build_object(
        'step', 1, 'decision', 'Regeneration requested',
        'rationale', COALESCE(p_feedback, 'No feedback'),
        'timestamp', NOW()
      )),
      v_caller_id::TEXT
    );
  END IF;

  RETURN jsonb_build_object(
    'success',      TRUE,
    'approval_id',  p_approval_id,
    'action',       p_action,
    'new_status',   v_new_status,
    'locked',       p_action = 'approve_and_lock'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- snapshot_course_version — creates a point-in-time version snapshot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_course_version(
  p_course_id  UUID,
  p_actor_id   TEXT DEFAULT 'system'
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_course    public.courses%ROWTYPE;
  v_snapshot  JSONB;
  v_version   NUMERIC(4,1);
  v_snap_id   UUID;
BEGIN
  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Determine next version number
  SELECT COALESCE(MAX(version), 0) + 0.1 INTO v_version
  FROM public.course_iterations WHERE course_id = p_course_id;

  -- Build snapshot (course + blueprint + modules summary)
  SELECT jsonb_build_object(
    'course',    row_to_json(v_course),
    'blueprint', (SELECT row_to_json(cb) FROM public.course_blueprints cb
                  WHERE cb.course_id = p_course_id AND cb.is_active = TRUE LIMIT 1),
    'modules',   (SELECT jsonb_agg(row_to_json(m)) FROM public.modules m
                  WHERE m.course_id = p_course_id AND m.deleted_at IS NULL),
    'market_doc',(SELECT row_to_json(mrd) FROM public.market_research_documents mrd
                  WHERE mrd.course_id = p_course_id AND mrd.is_active = TRUE LIMIT 1),
    'snapped_at', NOW()
  ) INTO v_snapshot;

  INSERT INTO public.course_iterations (
    course_id, version, snapshot_json, triggered_by, change_summary
  ) VALUES (
    p_course_id, v_version, v_snapshot, p_actor_id,
    format('Auto-snapshot at version %.1f. Triggered by %s.', v_version, p_actor_id)
  ) RETURNING id INTO v_snap_id;

  -- Update course current_version
  UPDATE public.courses SET current_version = v_version WHERE id = p_course_id;

  RETURN v_snap_id;
END;
$$;
