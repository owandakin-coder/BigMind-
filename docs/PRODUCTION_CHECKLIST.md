# Production Launch Checklist

## Infrastructure

- [ ] Supabase project created (production, not local)
- [ ] All 14 migrations applied: `supabase db push`
- [ ] Realtime enabled on: courses, agent_logs, approvals, analytics_tasks
- [ ] Storage buckets created (auto from migration 0008)
- [ ] DB webhook created pointing to n8n orchestrator

## Secrets & Environment

- [ ] `ANTHROPIC_API_KEY` set in Edge Function secrets
- [ ] `OPENAI_API_KEY` set in Edge Function secrets
- [ ] `ALLOWED_ORIGIN=https://yourdomain.com` set in Edge Function secrets
- [ ] `MAX_COST_PER_CALL_USD` set (recommend: `0.50` for launch)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` NOT in frontend env vars
- [ ] Vercel env vars set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`

## Edge Functions

- [ ] `execute-agent-workflow` deployed and accessible
- [ ] `export-publishing-package` deployed and accessible
- [ ] `perform-approval-action` deployed and accessible
- [ ] `get-audit-trail` deployed and accessible
- [ ] Test each function with a valid JWT (returns 200 or 4xx, not 500)

## Auth

- [ ] Email confirmation enabled
- [ ] Site URL set to production domain
- [ ] Redirect URLs include production domain
- [ ] JWT expiry set to 900 (15 min) for production
- [ ] Rate limits reviewed (default: 4 OTP emails/hour)

## n8n

- [ ] All 12 workflows imported
- [ ] All workflows activated
- [ ] Webhook URLs updated to production Edge Function URLs
- [ ] Supabase Service Role credential configured
- [ ] Test trigger: manually update a course status, verify n8n receives it

## Frontend

- [ ] Production build succeeds: `npm run build`
- [ ] Vercel deployment live
- [ ] Dashboard loads real data (not mock)
- [ ] ApprovalQueue approve/reject/regenerate work
- [ ] Toast notifications appear
- [ ] UpgradeCTA shows when credits exhausted
- [ ] Publishing package export works for at least one platform

## Security

- [ ] `ALLOWED_ORIGIN` set to production domain (not `*`)
- [ ] `service_role` key not in any frontend file
- [ ] Run security audit: `docs/SECURITY_AUDIT.md` — all items ✅
- [ ] Supabase MFA enabled for admin accounts

## Testing

- [ ] `npm run validate:system` passes against production DB
- [ ] Manual E2E: create course → run agent → approve → export package
- [ ] Credit deduction verified (check `ai_audit_logs` after agent run)
- [ ] User isolation verified (user A cannot see user B's courses)

## Monitoring

- [ ] Supabase Dashboard alerts configured
- [ ] `ai_audit_logs` reviewed for unexpected high costs
- [ ] `dead_letter_queue` empty (no failed workflows from setup)
- [ ] Agent performance view (`agent_performance_live`) accessible

## Go-Live

- [ ] First admin user set to `pro` plan with `admin_override = true`
- [ ] Seed data removed (or kept as demo)
- [ ] README updated with correct production URLs
- [ ] Team notified of launch
