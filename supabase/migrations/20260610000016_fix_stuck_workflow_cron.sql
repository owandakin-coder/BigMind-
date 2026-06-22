-- ============================================================
-- Migration 0016 — Fix detect-stuck-workflows cron
--
-- Problem: the original cron (migration 0009) used a direct
--   UPDATE public.courses SET status = 'failed'
-- which bypasses validate_state_transition(), skips pg_notify,
-- and skips the audit log written by transition_course_status().
--
-- Fix: replace with PERFORM transition_course_status(...) so the
-- state machine, audit trail, and realtime subscribers all fire.
-- ============================================================

SELECT cron.unschedule('detect-stuck-workflows');

SELECT cron.schedule(
  'detect-stuck-workflows',
  '*/30 * * * *',
  $$
    DO $body$
    DECLARE
      v_course_id UUID;
    BEGIN
      FOR v_course_id IN
        SELECT id FROM public.courses
        WHERE status IN (
          'market_research','architecture_design','content_generation',
          'sales_page_generation','marketing_prep','publishing'
        )
        AND updated_at < NOW() - INTERVAL '2 hours'
        AND deleted_at IS NULL
      LOOP
        BEGIN
          PERFORM public.transition_course_status(
            v_course_id,
            'failed'::public.course_status,
            'system_cron',
            jsonb_build_object(
              'rationale', 'Workflow stuck for >2 hours — auto-failed by cron'
            )
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'detect-stuck-workflows: course % transition failed: %',
            v_course_id, SQLERRM;
        END;
      END LOOP;
    END;
    $body$;
  $$
);
