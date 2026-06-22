-- Migration 0011: Credit deduction RPC + AI audit log table
-- Adds: deduct_ai_credits(), ai_audit_logs table

-- ── ai_audit_logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id          UUID        REFERENCES public.courses(id) ON DELETE SET NULL,
  agent_name         TEXT        NOT NULL,
  model              TEXT        NOT NULL,
  prompt_tokens      INTEGER     NOT NULL DEFAULT 0,
  completion_tokens  INTEGER     NOT NULL DEFAULT 0,
  cost_usd           NUMERIC(12,6) NOT NULL DEFAULT 0,
  credit_cost        INTEGER     NOT NULL DEFAULT 0,
  duration_ms        INTEGER,
  created_at         TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_audit_logs_user_id_idx  ON public.ai_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ai_audit_logs_course_id_idx ON public.ai_audit_logs(course_id);
CREATE INDEX IF NOT EXISTS ai_audit_logs_created_at_idx ON public.ai_audit_logs(created_at DESC);

-- RLS: users can read their own audit logs; only service role inserts
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_audit_logs_user_read" ON public.ai_audit_logs
  FOR SELECT USING (auth.uid() = user_id);

-- No INSERT policy — only service role (bypasses RLS) can insert

-- ── deduct_ai_credits RPC ──────────────────────────────────────────────────
-- Called by aiGateway.ts post-call (fire-and-forget)
-- Returns new credit balance or -1 if user is on enterprise (unlimited)
CREATE OR REPLACE FUNCTION public.deduct_ai_credits(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_agent_name TEXT,
  p_course_id  UUID DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan     TEXT;
  v_credits  INTEGER;
  v_new      INTEGER;
BEGIN
  SELECT plan, ai_credits
  INTO   v_plan, v_credits
  FROM   public.user_profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  -- Enterprise plan: unlimited credits, do not deduct
  IF v_plan = 'enterprise' THEN
    RETURN -1;
  END IF;

  -- Clamp to 0 — never go negative
  v_new := GREATEST(0, v_credits - p_amount);

  UPDATE public.user_profiles
  SET    ai_credits  = v_new,
         updated_at  = now()
  WHERE  id = p_user_id;

  RETURN v_new;
END;
$$;

-- ── check_ai_credits RPC ───────────────────────────────────────────────────
-- Called by frontend before starting an agent run
CREATE OR REPLACE FUNCTION public.check_ai_credits(
  p_user_id   UUID,
  p_agent_name TEXT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits  INTEGER;
  v_plan     TEXT;
  v_limit    INTEGER;
  v_cost     INTEGER;
  CREDIT_COSTS CONSTANT JSONB := '{
    "market_research_agent":     5,
    "course_architect_agent":    3,
    "content_production_agent":  10,
    "sales_page_agent":          4,
    "marketing_agent":           6,
    "analytics_agent":           1,
    "publishing_agent":          2,
    "portfolio_manager_agent":   2,
    "revenue_intelligence_agent":2,
    "seo_agent":                 2,
    "customer_success_agent":    2
  }';
BEGIN
  SELECT ai_credits, plan, credits_limit
  INTO   v_credits, v_plan, v_limit
  FROM   public.user_profiles
  WHERE  id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sufficient', false, 'reason', 'profile_not_found');
  END IF;

  v_cost := (CREDIT_COSTS ->> p_agent_name)::INTEGER;

  IF v_plan = 'enterprise' THEN
    RETURN jsonb_build_object('sufficient', true, 'credits', -1, 'cost', v_cost, 'plan', v_plan);
  END IF;

  RETURN jsonb_build_object(
    'sufficient', v_credits >= v_cost,
    'credits',    v_credits,
    'cost',       v_cost,
    'limit',      v_limit,
    'plan',       v_plan,
    'reason',     CASE WHEN v_credits < v_cost THEN 'insufficient_credits' ELSE NULL END
  );
END;
$$;

-- ── usage_summary view ────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.user_usage_summary AS
SELECT
  al.user_id,
  COUNT(*)                            AS total_agent_runs,
  SUM(al.credit_cost)                 AS total_credits_used,
  SUM(al.cost_usd)                    AS total_cost_usd,
  ROUND(AVG(al.duration_ms)::NUMERIC / 1000, 1) AS avg_duration_sec,
  COUNT(DISTINCT al.course_id)        AS courses_processed,
  MAX(al.created_at)                  AS last_run_at
FROM public.ai_audit_logs al
GROUP BY al.user_id;

COMMENT ON FUNCTION public.deduct_ai_credits IS 'Atomically deduct AI credits from user_profiles. Called by aiGateway post-call.';
COMMENT ON FUNCTION public.check_ai_credits  IS 'Check if user has sufficient credits for an agent run.';
COMMENT ON TABLE   public.ai_audit_logs      IS 'Immutable audit log of every AI gateway call.';
