# Deployment Guide

## Recommended Stack

| Layer | Service | Notes |
|-------|---------|-------|
| Frontend | Vercel | Zero-config Next.js, edge CDN |
| Database | Supabase Cloud | Managed Postgres + realtime |
| Edge Functions | Supabase Edge Runtime | Same project, auto-deployed |
| Orchestration | n8n Cloud or self-hosted | See N8N_GUIDE.md |

---

## Frontend (Vercel)

### 1. Connect Repository

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Repository
3. Framework: **Next.js** (auto-detected)
4. Root Directory: `/` (leave default)

### 2. Environment Variables

In Vercel dashboard → Settings → Environment Variables, add:

```
NEXT_PUBLIC_SUPABASE_URL        = https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJ...
NEXT_PUBLIC_APP_URL             = https://yourdomain.com
```

`SUPABASE_SERVICE_ROLE_KEY` is **not** needed in Vercel — it's only used by Edge Functions.

### 3. Deploy

```bash
git push origin main    # Vercel auto-deploys
```

Or manually: `npx vercel --prod`

---

## Edge Functions (Supabase)

```bash
# Deploy all 4 functions
supabase functions deploy execute-agent-workflow --project-ref YOUR_REF
supabase functions deploy export-publishing-package --project-ref YOUR_REF
supabase functions deploy perform-approval-action --project-ref YOUR_REF
supabase functions deploy get-audit-trail --project-ref YOUR_REF

# Set production secrets
supabase secrets set --project-ref YOUR_REF \
  ANTHROPIC_API_KEY=sk-ant-... \
  OPENAI_API_KEY=sk-proj-... \
  ALLOWED_ORIGIN=https://yourdomain.com \
  MAX_COST_PER_CALL_USD=0.50
```

Function URLs follow this pattern:
```
https://YOUR_REF.supabase.co/functions/v1/execute-agent-workflow
```

---

## Database Migrations

```bash
# Push migrations to production
supabase db push --project-ref YOUR_REF

# Verify
supabase db execute --project-ref YOUR_REF \
  "SELECT name FROM supabase_migrations.schema_migrations ORDER BY name;"
```

---

## n8n Webhook URL

After deploying Edge Functions, update the webhook URL in n8n:

In `00_main_orchestrator.json`, the webhook trigger URL should be:
```
https://YOUR_REF.supabase.co/functions/v1/execute-agent-workflow
```

Set `Authorization: Bearer <service_role_key>` header in n8n HTTP Request nodes.

---

## Production Checklist

- [ ] All 14 migrations applied to production DB
- [ ] Edge Function secrets set (`supabase secrets set`)
- [ ] `ALLOWED_ORIGIN` set to production domain
- [ ] Vercel env vars set
- [ ] n8n workflows imported and webhook URLs updated
- [ ] Auth email confirmation enabled (Supabase Dashboard → Auth → Email)
- [ ] Run `npm run validate:system` against production
- [ ] Test full pipeline with a real course (end-to-end)
- [ ] Test approval flow
- [ ] Test publishing package export

---

## Rollback

Migrations cannot be auto-rolled back. If a migration breaks production:

1. Identify the failing migration (Supabase Dashboard → Database → Migrations)
2. Write a manual reversal SQL and run it via Supabase SQL Editor
3. Remove the migration file, fix it, re-push

Always test migrations on staging before production.

---

## Scaling Considerations

- **Edge Functions**: Auto-scale up to 500 concurrent requests (Supabase Pro)
- **Database**: Upgrade Supabase plan for more connections + compute
- **n8n**: Self-host with Redis queue for high throughput (>100 courses/day)
- **AI costs**: Set `MAX_COST_PER_CALL_USD` conservatively; monitor via `ai_audit_logs`
