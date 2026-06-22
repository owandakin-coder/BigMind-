-- ============================================================
-- Migration 0013: Production Observability
-- ============================================================

-- ─── Agent execution metrics (materialized from ai_audit_logs) ───
CREATE TABLE IF NOT EXISTS agent_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name      TEXT NOT NULL,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  total_calls     INTEGER NOT NULL DEFAULT 0,
  success_calls   INTEGER NOT NULL DEFAULT 0,
  failed_calls    INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms NUMERIC(10,2),
  p95_duration_ms NUMERIC(10,2),
  total_cost_usd  NUMERIC(12,6),
  total_tokens    INTEGER,
  error_rate_pct  NUMERIC(5,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Dead letter queue ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    UUID REFERENCES courses(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name   TEXT NOT NULL,
  error_code   TEXT,
  error_msg    TEXT,
  payload      JSONB,
  retry_count  INTEGER NOT NULL DEFAULT 0,
  max_retries  INTEGER NOT NULL DEFAULT 3,
  last_attempt TIMESTAMPTZ,
  next_retry   TIMESTAMPTZ,
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','retrying','resolved','abandoned')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dlq_status        ON dead_letter_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlq_course        ON dead_letter_queue(course_id);
CREATE INDEX IF NOT EXISTS idx_dlq_next_retry    ON dead_letter_queue(next_retry) WHERE status = 'pending';

-- ─── Workflow retry history ───────────────────────────────────
CREATE TABLE IF NOT EXISTS retry_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dlq_id       UUID REFERENCES dead_letter_queue(id) ON DELETE CASCADE,
  course_id    UUID REFERENCES courses(id) ON DELETE CASCADE,
  agent_name   TEXT NOT NULL,
  attempt_num  INTEGER NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'auto',
  status       TEXT NOT NULL CHECK (status IN ('success','failed','timeout')),
  error_msg    TEXT,
  duration_ms  INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retry_dlq ON retry_history(dlq_id, created_at DESC);

-- ─── System health snapshots ──────────────────────────────────
CREATE TABLE IF NOT EXISTS system_health_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_courses  INTEGER,
  pending_approvals INTEGER,
  dlq_pending     INTEGER,
  credits_used_today INTEGER,
  api_errors_1h   INTEGER,
  avg_agent_latency_ms NUMERIC(10,2),
  total_cost_today_usd NUMERIC(12,4)
);

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE retry_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own DLQ items"
  ON dead_letter_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages DLQ"
  ON dead_letter_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users see own retry history"
  ON retry_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dead_letter_queue d
      WHERE d.id = retry_history.dlq_id AND d.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = retry_history.course_id AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "Anyone reads agent metrics"
  ON agent_metrics FOR SELECT USING (true);

-- ─── Live observability view ──────────────────────────────────
CREATE OR REPLACE VIEW agent_performance_live AS
SELECT
  al.agent::TEXT                                                             AS agent_name,
  COUNT(*)                                                                   AS total_calls,
  COUNT(*) FILTER (WHERE al.event_type = 'execution_complete')               AS success_count,
  COUNT(*) FILTER (WHERE al.event_type = 'error')                            AS fail_count,
  NULL::numeric                                                               AS avg_duration_ms,
  NULL::numeric                                                               AS p95_duration_ms,
  ROUND(COUNT(*) FILTER (WHERE al.event_type = 'error')::numeric / NULLIF(COUNT(*),0) * 100, 1) AS error_rate_pct,
  ROUND(SUM(al.total_cost_usd)::numeric, 4)                                  AS total_cost_usd,
  SUM(al.prompt_tokens + al.completion_tokens)                               AS total_tokens
FROM agent_logs al
WHERE al.created_at > now() - INTERVAL '24 hours'
GROUP BY al.agent;

-- ─── Failed workflows view ────────────────────────────────────
CREATE OR REPLACE VIEW failed_workflows AS
SELECT
  al.id                 AS log_id,
  al.course_id,
  al.agent::TEXT        AS agent_name,
  al.event_type         AS status,
  al.error_message,
  al.created_at         AS started_at,
  NULL::TIMESTAMPTZ     AS completed_at,
  c.title               AS course_title,
  c.owner_id            AS user_id,
  c.status              AS course_status,
  dlq.id                AS dlq_id,
  dlq.retry_count,
  dlq.status            AS dlq_status
FROM agent_logs al
JOIN courses c ON c.id = al.course_id
LEFT JOIN dead_letter_queue dlq
  ON dlq.course_id = al.course_id AND dlq.agent_name = al.agent::TEXT
WHERE al.event_type = 'error'
ORDER BY al.created_at DESC;

-- ─── Audit trail view ─────────────────────────────────────────
CREATE OR REPLACE VIEW audit_trail AS
SELECT
  'approval'          AS event_type,
  a.id                AS event_id,
  a.course_id,
  a.created_at,
  a.reviewer_id       AS actor_id,
  a.action::TEXT      AS action,
  jsonb_build_object('stage', a.approval_stage, 'notes', a.feedback) AS details
FROM approvals a
UNION ALL
SELECT
  'agent_log'         AS event_type,
  al.id               AS event_id,
  al.course_id,
  al.created_at,
  c.owner_id          AS actor_id,
  al.agent::TEXT      AS action,
  jsonb_build_object('status', al.event_type, 'error', al.error_message) AS details
FROM agent_logs al
JOIN courses c ON c.id = al.course_id
UNION ALL
SELECT
  'credit_usage'      AS event_type,
  cul.id              AS event_id,
  cul.course_id,
  cul.created_at,
  cul.user_id         AS actor_id,
  cul.event_type      AS action,
  jsonb_build_object('amount', cul.amount, 'balance_after', cul.balance_after, 'note', cul.note) AS details
FROM credit_usage_log cul
ORDER BY created_at DESC;
