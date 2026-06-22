# Troubleshooting Guide

## Edge Functions

### `401 Unauthorized` from Edge Function
**Cause:** Missing or expired JWT in `Authorization` header.  
**Fix:** Ensure the frontend passes the session token: `Authorization: Bearer ${session.access_token}`

### `403 Forbidden` from Edge Function
**Cause:** JWT user ID doesn't match `courseId` owner in DB.  
**Fix:** Verify the course belongs to the authenticated user. Check `courses.user_id = auth.uid()`.

### `402 CREDITS_EXHAUSTED`
**Cause:** User has 0 AI credits remaining.  
**Fix:** Admin can grant credits via `SELECT admin_grant_credits('user-uuid', 100, 'Support grant');` in Supabase SQL Editor. Or upgrade the user's plan.

### `402 COST_CEILING`
**Cause:** A single AI call exceeded `MAX_COST_PER_CALL_USD`.  
**Fix:** Increase `MAX_COST_PER_CALL_USD` in Edge Function secrets, or reduce `maxTokens` in the agent's `callAIGateway` call.

### Edge Function returns `500` with no body
**Cause:** Missing environment variable.  
**Fix:** Check Supabase Dashboard → Edge Functions → Secrets. Verify `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` are all set.

---

## Database

### Migration fails with "type already exists"
**Cause:** Applying migrations to a DB that already has partial schema.  
**Fix:** 
```sql
-- Check what already exists
SELECT typname FROM pg_type WHERE typname IN ('course_status', 'approval_action', 'agent_name_enum');
-- Drop and re-run, or use IF NOT EXISTS in the migration
```

### RLS blocking a query that should work
**Cause:** Policy condition not matching.  
**Fix:** 
```sql
-- Debug: run as authenticated user
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims.sub = 'your-user-uuid';
SELECT * FROM courses; -- Should only show your courses
```

### `deduct_ai_credits` returns 0 but credits weren't deducted
**Cause:** `FOR UPDATE` lock contention in high concurrency (rare).  
**Fix:** Check `ai_audit_logs` — if the call is logged but credits didn't deduct, the RPC's `IF ai_credits < p_amount THEN RETURN 0` branch fired. User's credits were genuinely 0 at deduction time.

---

## n8n

### Workflow not triggering on status change
**Cause:** Supabase webhook not configured, or webhook secret mismatch.  
**Fix:**
1. Supabase Dashboard → Database → Webhooks — verify webhook exists for `courses` UPDATE
2. Check n8n execution history for the trigger workflow
3. Verify `x-courseforge-secret` header matches `SUPABASE_WEBHOOK_SECRET`

### n8n HTTP Request node gets `401`
**Cause:** Missing or wrong `Authorization` header in n8n HTTP Request node.  
**Fix:** Use the `Supabase Service Role` credential (Header Auth). Value must be `Bearer SERVICE_ROLE_KEY` (with "Bearer " prefix).

### Agent ran but course status didn't update
**Cause:** Edge Function errored after the AI call but before DB update. Check agent_logs.  
**Fix:**
```sql
SELECT agent_name, status, error_message, created_at
FROM agent_logs
WHERE course_id = 'your-course-id'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Frontend

### Realtime subscription not receiving updates
**Cause:** Supabase Realtime not enabled for the table, or RLS blocking channel subscription.  
**Fix:**
1. Supabase Dashboard → Database → Replication — enable `courses`, `agent_logs`, `approvals`
2. Check browser console for `"Realtime connection error"`

### Toast not showing
**Cause:** `ToastProvider` not wrapping the component tree.  
**Fix:** Verify `src/app/providers.tsx` has `<ToastProvider>` as the outermost wrapper.

### ApprovalQueue shows stale data after action
**Cause:** Query not invalidated after mutation.  
**Fix:** `useApprovalAction` calls `queryClient.invalidateQueries` in `onSettled`. If it's not refreshing, check the `queryKey` matches exactly: `['course', courseId]`, `['pending-approvals', courseId]`.

---

## Credits & Billing

### User can't generate despite having credits
**Cause:** `billing_status = 'past_due'` or `'canceled'`.  
**Fix:** 
```sql
UPDATE user_profiles SET billing_status = 'active' WHERE id = 'user-uuid';
```

### Admin needs to reset a user's credits manually
```sql
SELECT admin_grant_credits('user-uuid', 500, 'Monthly reset - manual');
```

### Check a user's current credit state
```sql
SELECT id, plan, ai_credits, credits_limit, billing_status, admin_override
FROM user_profiles
WHERE id = 'user-uuid';
```
