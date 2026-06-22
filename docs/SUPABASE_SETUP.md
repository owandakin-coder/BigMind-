# Supabase Setup Guide

## 1. Create Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Set database password (save it — you'll need it for direct DB access)
4. Select region closest to your users
5. Wait ~2 minutes for provisioning

## 2. Get API Keys

**Project Settings → API:**

| Key | Env Var | Where Used |
|-----|---------|-----------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | Frontend + Edge Functions |
| `anon` public | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend only |
| `service_role` | `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only (never frontend) |

## 3. Apply Migrations

```bash
# Link CLI to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push all 14 migrations
supabase db push

# Confirm
supabase db execute "SELECT COUNT(*) FROM supabase_migrations.schema_migrations;"
# → 14
```

## 4. Enable Realtime

Dashboard → Database → Replication → enable these tables:
- `courses`
- `agent_logs`
- `approvals`
- `analytics_tasks`

## 5. Configure Auth

Dashboard → Authentication → Settings:
- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: add `https://yourdomain.com/**`
- **Email Confirmation**: Enable for production
- **JWT expiry**: Set to `900` (15 min) for production

## 6. Storage Buckets

Migration `0008_storage.sql` creates buckets automatically. Verify:

Dashboard → Storage:
- `course-assets` — private, authenticated upload
- `thumbnails` — public read
- `exports` — private, authenticated

## 7. Database Webhooks (for n8n)

Dashboard → Database → Webhooks → Create:

- **Name**: `courseforge-status-change`
- **Schema**: `public`
- **Table**: `courses`
- **Events**: ☑ Update
- **Webhook URL**: Your n8n webhook URL (from `00_main_orchestrator.json`)
- **HTTP Method**: POST
- **Headers**:
  - `Content-Type: application/json`
  - `x-courseforge-secret: YOUR_WEBHOOK_SECRET`

## 8. Edge Functions

```bash
# Deploy
supabase functions deploy execute-agent-workflow
supabase functions deploy export-publishing-package
supabase functions deploy perform-approval-action
supabase functions deploy get-audit-trail

# Set secrets (required for functions to work)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set OPENAI_API_KEY=sk-proj-...
supabase secrets set ALLOWED_ORIGIN=https://yourdomain.com
supabase secrets set MAX_COST_PER_CALL_USD=0.50
```

## 9. Verify Everything

```bash
npm run validate:system
```

Expected output:
```
✅ Tables: 14/14 exist
✅ RPC: perform_approval_action callable
✅ RPC: deduct_ai_credits callable
✅ RPC: can_generate callable
✅ Data integrity: OK
✅ VALIDATION PASSED
```

## 10. First Admin User

After your first user signs up:

```sql
-- Grant them admin credits and pro plan
UPDATE user_profiles
SET plan = 'pro', ai_credits = 2000, credits_limit = 2000, admin_override = true
WHERE id = 'YOUR_USER_UUID';
```
