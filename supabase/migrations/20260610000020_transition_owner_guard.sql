-- ---------------------------------------------------------------------------
-- 20260610000020_transition_owner_guard.sql
--
-- Security fix (IDOR): transition_course_status was EXECUTE-able by any
-- authenticated user and performed NO ownership check, so a logged-in user
-- could drive ANY course (including other users') through state transitions.
--
-- Fix: when a *real* authenticated user calls it directly, require ownership.
-- Internal callers are unaffected because their auth.uid() is NULL or already
-- the owner:
--   * Edge-function agents call via the service-role client  -> auth.uid() = NULL  (allowed)
--   * pg_cron (detect-stuck-workflows) runs as system        -> auth.uid() = NULL  (allowed)
--   * perform_approval_action PERFORMs it for the approver    -> auth.uid() = owner (allowed; it already checks ownership)
--   * the dashboard "Reset to draft" button (owner)           -> auth.uid() = owner (allowed)
-- Only a direct call by a non-owner authenticated user is now rejected.
--
-- Logic is otherwise byte-for-byte identical to the original function.
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
  v_owner      UUID;
  v_caller     UUID := auth.uid();
BEGIN
  -- Lock row for update (also read owner for the authorization guard)
  SELECT status, owner_id INTO v_old_status, v_owner
  FROM public.courses
  WHERE id = p_course_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found: %', p_course_id USING ERRCODE = 'P0001';
  END IF;

  -- IDOR guard: a directly-calling authenticated user must own the course.
  -- (NULL caller = service role / system / SECURITY DEFINER context = allowed.)
  IF v_caller IS NOT NULL AND v_caller IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = 'P0001',
            DETAIL  = format('caller %s is not the owner of course %s', v_caller, p_course_id);
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
