# Setup Guide

## 1. Accounts You Need

| Service | Required | Purpose |
|---------|----------|---------|
| Supabase | ✅ | Database, Auth, Edge Functions, Storage |
| Anthropic | ✅ | Claude models (market research, content) |
| OpenAI | ✅ | GPT-4o (optional agents) + embeddings |
| n8n | ✅ | Workflow orchestration |
| Upstash Redis | ⚠️ | Rate limiting (optional for dev) |

---

## 2. Supabase Project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Choose a strong database password (save it)
3. Select a region close to your users
4. After creation, go to **Project Settings → API**:
   - Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - Copy `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (never expose this)

---

## 3. Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI
ANTHROPIC_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-proj-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
ALLOWED_ORIGIN=http://localhost:3000

# Cost guardrail (default $0.50/call)
MAX_COST_PER_CALL_USD=0.50
```

---

## 4. Database Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Apply all 14 migrations
supabase db push

# Verify (should show 14 rows)
supabase db execute "SELECT count(*) FROM supabase_migrations.schema_migrations;"
```

---

## 5. Edge Function Secrets

Edge Functions need secrets set separately from `.env.local`:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set OPENAI_API_KEY=sk-proj-...
supabase secrets set ALLOWED_ORIGIN=https://yourdomain.com
supabase secrets set MAX_COST_PER_CALL_USD=0.50

# If using Upstash:
supabase secrets set UPSTASH_REDIS_REST_URL=https://...
supabase secrets set UPSTASH_REDIS_REST_TOKEN=...
```

---

## 6. Deploy Edge Functions

```bash
# Deploy all functions
npm run functions:deploy

# Or individually:
supabase functions deploy execute-agent-workflow
supabase functions deploy export-publishing-package
supabase functions deploy perform-approval-action
supabase functions deploy get-audit-trail
```

---

## 7. Storage Buckets

The migration `0008_storage.sql` creates the required buckets. Verify in Supabase Dashboard → Storage:
- `course-assets` (authenticated access)
- `thumbnails` (public)
- `exports` (authenticated)

---

## 8. Seed Demo Data

```bash
# Create 3 demo users and 4 sample courses
npm run seed

# Or clean existing seed data and re-seed
npm run seed:clean
```

---

## 9. Ingest Market Embeddings (optional but recommended)

This feeds the RAG system that enriches market research:

```bash
# From a JSONL file with {source_label, content} per line
npm run embeddings:ingest -- --file ./data/market-research.jsonl
```

---

## 10. Verify Setup

```bash
# Live read-only DB audit — checks all tables, RPCs, data integrity
npm run validate:system
```

Should output: `✅ VALIDATION PASSED — System is ready`

---

## Local Development

```bash
npm run dev                # Next.js on :3000
supabase start             # Local Supabase on :54321
supabase functions serve   # Edge Functions on :54321/functions/v1/
```

Set for local dev:
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key from supabase start output>
```
