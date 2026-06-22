-- ---------------------------------------------------------------------------
-- 20260610000017_final_approval_gate_approval.sql
--
-- Fixes a pipeline gap: when a course transitions marketing_review →
-- final_approval_gate (via perform_approval_action), NO approval record was
-- created for the final_approval_gate stage, and no agent runs at that gate.
-- The course would sit at final_approval_gate with no actionable approval,
-- so the UI could not render the "Approve for Publishing" action.
--
-- Every other HITL gate gets its approval row created by the agent that runs
-- immediately before it. final_approval_gate has no such agent, so we create
-- the approval via an AFTER UPDATE trigger whenever a course enters that state.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_final_approval_gate_approval()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
BEGIN
  -- Only act when entering final_approval_gate, and only if no pending
  -- approval already exists for it (idempotent).
  IF NOT EXISTS (
    SELECT 1 FROM public.approvals
    WHERE course_id = NEW.id
      AND approval_stage = 'final_approval_gate'
      AND action IS NULL
      AND deleted_at IS NULL
  ) THEN
    INSERT INTO public.approvals (course_id, approval_stage, target_type, target_id)
    VALUES (NEW.id, 'final_approval_gate', 'full_course', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_final_approval_gate ON public.courses;

CREATE TRIGGER trg_create_final_approval_gate
AFTER UPDATE OF status ON public.courses
FOR EACH ROW
WHEN (NEW.status = 'final_approval_gate' AND OLD.status IS DISTINCT FROM 'final_approval_gate')
EXECUTE FUNCTION public.create_final_approval_gate_approval();

-- Backfill: any course already stuck at final_approval_gate with no pending
-- approval gets one now.
INSERT INTO public.approvals (course_id, approval_stage, target_type, target_id)
SELECT c.id, 'final_approval_gate', 'full_course', c.id
FROM public.courses c
WHERE c.status = 'final_approval_gate'
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.approvals a
    WHERE a.course_id = c.id
      AND a.approval_stage = 'final_approval_gate'
      AND a.action IS NULL
      AND a.deleted_at IS NULL
  );
