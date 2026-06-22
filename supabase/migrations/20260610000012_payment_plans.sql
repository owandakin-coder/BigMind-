-- ============================================================
-- Migration 0012: Payment & Plan System Foundation
-- ============================================================

-- ─── Plan definitions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_definitions (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  ai_credits    INTEGER NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_annual  NUMERIC(10,2) NOT NULL DEFAULT 0,
  features      JSONB NOT NULL DEFAULT '[]',
  limits        JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO plan_definitions (id, display_name, ai_credits, price_monthly, price_annual, features, limits) VALUES
  ('free',       'Free',       50,   0,     0,     '["1 course","50 AI credits/mo","Community support"]',   '{"courses":1,"exports":0,"platforms":1}'),
  ('starter',    'Starter',    500,  29,    290,   '["5 courses","500 AI credits/mo","Email support","All 6 platform exports"]', '{"courses":5,"exports":10,"platforms":6}'),
  ('pro',        'Pro',        2000, 79,    790,   '["Unlimited courses","2000 AI credits/mo","Priority support","Analytics","Custom domain"]', '{"courses":-1,"exports":-1,"platforms":6}'),
  ('enterprise', 'Enterprise', -1,   299,   2990,  '["Unlimited everything","Dedicated support","White-label","API access","Custom integrations"]', '{"courses":-1,"exports":-1,"platforms":6}')
ON CONFLICT (id) DO UPDATE
  SET display_name  = EXCLUDED.display_name,
      ai_credits    = EXCLUDED.ai_credits,
      price_monthly = EXCLUDED.price_monthly,
      price_annual  = EXCLUDED.price_annual,
      features      = EXCLUDED.features,
      limits        = EXCLUDED.limits;

-- ─── Billing status on user_profiles ──────────────────────
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS plan              TEXT    NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS ai_credits        INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS credits_limit     INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS billing_status    TEXT    NOT NULL DEFAULT 'active'
    CHECK (billing_status IN ('active','past_due','canceled','trialing')),
  ADD COLUMN IF NOT EXISTS trial_ends_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_sub_id     TEXT,
  ADD COLUMN IF NOT EXISTS credits_reset_at  TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', now()) + INTERVAL '1 month'),
  ADD COLUMN IF NOT EXISTS admin_override    BOOLEAN NOT NULL DEFAULT false;

-- Sync plan from existing tier column
UPDATE user_profiles SET plan = tier::TEXT;

-- Set credits_limit from plan definitions (bootstrap existing users)
UPDATE user_profiles up
SET credits_limit = pd.ai_credits
FROM plan_definitions pd
WHERE pd.id = up.plan
  AND up.credits_limit IS DISTINCT FROM pd.ai_credits
  AND pd.ai_credits > 0;

-- ─── Credit usage log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_usage_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN ('deduct','refund','reset','bonus','admin')),
  amount      INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  agent_name  TEXT,
  course_id   UUID REFERENCES courses(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_usage_user_created ON credit_usage_log(user_id, created_at DESC);

-- ─── RLS ───────────────────────────────────────────────────
ALTER TABLE plan_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans"
  ON plan_definitions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users read own credit log"
  ON credit_usage_log FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role inserts
CREATE POLICY "Service role manages credit log"
  ON credit_usage_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── Check generation permission ──────────────────────────
-- Returns true if user can generate (has credits or is enterprise/admin)
CREATE OR REPLACE FUNCTION can_generate(p_user_id UUID, p_credit_cost INTEGER DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile user_profiles%ROWTYPE;
  v_plan    plan_definitions%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM user_profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'User profile not found');
  END IF;

  SELECT * INTO v_plan FROM plan_definitions WHERE id = v_profile.plan;

  -- Admin override always allowed
  IF v_profile.admin_override THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin_override');
  END IF;

  -- Enterprise: unlimited
  IF v_profile.plan = 'enterprise' THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'enterprise_unlimited');
  END IF;

  -- Billing status check
  IF v_profile.billing_status = 'past_due' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'billing_past_due',
      'upgradeUrl', '/settings/billing');
  END IF;

  IF v_profile.billing_status = 'canceled' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'subscription_canceled',
      'upgradeUrl', '/pricing');
  END IF;

  -- Credit check
  IF v_profile.ai_credits < p_credit_cost THEN
    RETURN jsonb_build_object(
      'allowed',     false,
      'reason',      'insufficient_credits',
      'credits',     v_profile.ai_credits,
      'required',    p_credit_cost,
      'plan',        v_profile.plan,
      'upgradeUrl',  '/pricing'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'credits', v_profile.ai_credits,
    'plan',    v_profile.plan
  );
END;
$$;

-- ─── Monthly credit reset ──────────────────────────────────
-- Called via cron job or admin panel
CREATE OR REPLACE FUNCTION reset_monthly_credits(p_user_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE user_profiles up
  SET
    ai_credits       = pd.ai_credits,
    credits_reset_at = date_trunc('month', now()) + INTERVAL '1 month'
  FROM plan_definitions pd
  WHERE pd.id = up.plan
    AND pd.ai_credits > 0              -- skip enterprise (-1)
    AND up.billing_status = 'active'
    AND (p_user_id IS NULL OR up.id = p_user_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ─── Admin credit override ─────────────────────────────────
CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_user_id UUID,
  p_amount  INTEGER,
  p_note    TEXT DEFAULT 'Admin grant'
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  UPDATE user_profiles
  SET ai_credits = GREATEST(0, ai_credits + p_amount)
  WHERE id = p_user_id
  RETURNING ai_credits INTO v_new_balance;

  INSERT INTO credit_usage_log (user_id, event_type, amount, balance_after, note)
  VALUES (p_user_id, 'admin', p_amount, v_new_balance, p_note);

  RETURN v_new_balance;
END;
$$;

-- ─── Usage summary view ────────────────────────────────────
CREATE OR REPLACE VIEW user_billing_summary AS
SELECT
  up.id,
  up.plan,
  up.ai_credits,
  up.credits_limit,
  up.billing_status,
  up.trial_ends_at,
  up.current_period_end,
  up.credits_reset_at,
  up.admin_override,
  pd.display_name   AS plan_name,
  pd.price_monthly,
  pd.features,
  pd.limits,
  CASE
    WHEN pd.ai_credits = -1 THEN 0
    WHEN pd.ai_credits = 0  THEN 100
    ELSE ROUND((1.0 - up.ai_credits::numeric / NULLIF(pd.ai_credits, 0)) * 100, 1)
  END AS credits_used_pct
FROM user_profiles up
LEFT JOIN plan_definitions pd ON pd.id = up.plan;

-- Allow users to read their own billing summary
CREATE POLICY "Users read own billing summary"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);
