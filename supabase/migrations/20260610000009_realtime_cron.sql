-- =============================================================================
-- Migration 0009: Realtime Publications + Cron Jobs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- REALTIME: subscribe to these tables only
-- (agent_logs is high-write — kept on subscription but with INSERT-only filter)
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.courses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_tasks;

-- ---------------------------------------------------------------------------
-- CRON: expire stale market embeddings (runs daily at 02:00 UTC)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'expire-market-embeddings',
  '0 2 * * *',
  $$
    DELETE FROM public.market_embeddings
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
  $$
);

-- ---------------------------------------------------------------------------
-- CRON: detect stuck workflows (courses in agent-run states > 2 hours)
-- Updates them to 'failed' and logs the timeout
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'detect-stuck-workflows',
  '*/30 * * * *',   -- every 30 minutes
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
        UPDATE public.courses SET status = 'failed' WHERE id = v_course_id;

        INSERT INTO public.agent_logs (
          course_id, agent, event_type, error_code, error_message, actor_id,
          reasoning_trace
        ) VALUES (
          v_course_id, 'market_research_agent', 'error',
          'TIMEOUT', 'Workflow stuck for >2 hours — auto-failed by cron',
          'system_cron',
          jsonb_build_array(jsonb_build_object(
            'step', 1,
            'decision', 'Auto-failed due to timeout',
            'rationale', 'Course was in an agent-run status for >2 hours without progress',
            'timestamp', NOW()
          ))
        );
      END LOOP;
    END;
    $body$;
  $$
);

-- ---------------------------------------------------------------------------
-- CRON: reset monthly billing cycles (runs at midnight UTC on 1st of month)
-- ---------------------------------------------------------------------------
SELECT cron.schedule(
  'reset-billing-cycles',
  '0 0 1 * *',
  $$
    UPDATE public.user_profiles
    SET
      ai_credits_used     = 0,
      billing_cycle_start = NOW()
    WHERE billing_cycle_start < NOW() - INTERVAL '30 days';
  $$
);
