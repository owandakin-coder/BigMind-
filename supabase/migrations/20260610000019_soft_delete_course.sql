-- ---------------------------------------------------------------------------
-- 20260610000019_soft_delete_course.sql
--
-- Owner-only SOFT delete for courses.
--
-- Why: the dashboard "Delete course" button did a hard DELETE, which cascades
-- to agent_logs — an immutable audit table whose DELETE is blocked by trigger.
-- So deleting any course that has run an agent failed. A direct client UPDATE of
-- deleted_at is rejected by the courses RLS policies. The correct fix is a
-- SECURITY DEFINER RPC (same pattern as transition_course_status /
-- perform_approval_action) that sets deleted_at after verifying ownership.
--
-- Guarantees:
--   1. Never deletes agent_logs (no hard delete at all — only sets deleted_at).
--   2. No hard delete.
--   3. RLS on courses is unchanged; ownership is enforced inside the function.
--   4. Only the course owner (auth.uid() = courses.owner_id) can soft-delete it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.soft_delete_course(p_course_id UUID)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_caller  UUID := auth.uid();
  v_owner   UUID;
  v_deleted TIMESTAMPTZ;
BEGIN
  -- Must be an authenticated caller
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_id, deleted_at
    INTO v_owner, v_deleted
  FROM public.courses
  WHERE id = p_course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'course_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Only the owner may delete their own course
  IF v_owner IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'not_authorized'
      USING ERRCODE = 'P0001',
            DETAIL  = format('caller %s is not the owner of course %s', v_caller, p_course_id);
  END IF;

  -- Idempotent: already soft-deleted → no-op
  IF v_deleted IS NOT NULL THEN
    RETURN p_course_id;
  END IF;

  -- SOFT delete only. agent_logs and all child rows are left intact.
  UPDATE public.courses
  SET deleted_at = NOW()
  WHERE id = p_course_id;

  RETURN p_course_id;
END;
$$;

-- Execution is limited to authenticated users; ownership is enforced inside.
REVOKE ALL ON FUNCTION public.soft_delete_course(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_course(UUID) TO authenticated;
