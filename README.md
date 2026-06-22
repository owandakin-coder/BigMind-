# CourseForge AI

An AI-powered course creation platform that takes a course idea from concept to publish-ready in a fully automated 25-state pipeline, with human approval gates at every critical stage.

## What It Does

1. You enter a course topic and niche
2. 11 AI agents run sequentially (Market Research → Course Architecture → Content Production → Sales → Marketing → Analytics → Publishing)
3. You approve or reject at each gate
4. When approved, a publish-ready package is generated for Udemy, Gumroad, Teachable, Thinkific, Kajabi, or Podia

## Architecture

```
Next.js 15 (App Router)
  ↓
Supabase (PostgreSQL + pgvector + Realtime + Auth + Storage)
  ↓
Deno Edge Functions (JWT-validated, service-role DB ops)
  ↓
n8n Orchestrator (12 workflows — triggers agents on status transitions)
  ↓
AI Gateway (Anthropic + OpenAI, PII sanitization, cost metering, credit deduction)
```

### Key Numbers
- **21** course status states
- **11** AI agents
- **14** Supabase migrations
- **4** Edge Functions
- **12** n8n workflows
- **6** publishing platforms
- **4** billing plans (free / starter / pro / enterprise)

## Quick Start

### Prerequisites
- Node.js 20+
- Supabase CLI (`npm install -g supabase`)
- n8n (self-hosted or cloud)
- Anthropic API key
- OpenAI API key (for embeddings)

### 1. Clone & Install

```bash
git clone https://github.com/yourorg/courseforge-ai
cd courseforge-ai
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
# Fill in all values — see SETUP_GUIDE.md for details
```

### 3. Supabase

```bash
supabase start               # local dev instance
supabase db push             # apply all 14 migrations
npm run db:types             # regenerate TypeScript types
npm run seed                 # seed demo data (optional)
```

### 4. Run

```bash
npm run dev                  # Next.js on :3000
supabase functions serve     # Edge Functions on :54321
```

### 5. n8n

Import all JSON files from `n8n/workflows/` into your n8n instance.  
Update webhook URLs in `00_main_orchestrator.json` to point to your Edge Functions.

## Project Structure

```
courseforge-ai/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── dashboard/          # Course library
│   │   └── courses/[id]/       # Creator Command Center
│   ├── components/
│   │   ├── approval/           # ApprovalQueue
│   │   ├── billing/            # UpgradeCTA, GenerationBlocker
│   │   ├── pipeline/           # PipelineVisualizer
│   │   └── ui/                 # Toast, shared primitives
│   ├── hooks/                  # All TanStack Query hooks
│   └── lib/supabase/           # Client + server Supabase clients
├── supabase/
│   ├── functions/              # 4 Deno Edge Functions
│   │   ├── _shared/            # aiGateway, cors, errors, JWT utils
│   │   ├── execute-agent-workflow/
│   │   ├── export-publishing-package/
│   │   ├── perform-approval-action/
│   │   └── get-audit-trail/
│   └── migrations/             # 14 ordered SQL migrations
├── n8n/workflows/              # 12 importable n8n JSONs
├── tests/
│   ├── e2e/                    # Full pipeline E2E test
│   └── fixtures/               # Test data factories
├── scripts/
│   ├── seed-test-data.mjs      # Demo data seeder
│   └── ingest-embeddings.mjs   # Market research RAG ingestion
└── docs/
    ├── SETUP_GUIDE.md
    ├── DEPLOYMENT_GUIDE.md
    ├── SECURITY_AUDIT.md
    └── PRODUCTION_READINESS.md
```

## Scripts

```bash
npm run dev              # Start Next.js dev server
npm run build            # Production build
npm run type-check       # TypeScript check
npm run test             # Unit tests
npm run test:e2e-workflow # Full E2E pipeline test
npm run validate:system  # Live DB audit (read-only)
npm run seed             # Seed demo data
npm run seed:clean       # Delete seed data, re-seed
npm run db:types         # Regenerate Supabase TypeScript types
npm run functions:serve  # Serve Edge Functions locally
npm run functions:deploy # Deploy all Edge Functions to Supabase
npm run embeddings:ingest # Ingest market research into pgvector
```

## Docs

- [Setup Guide](docs/SETUP_GUIDE.md)
- [Deployment Guide](docs/DEPLOYMENT_GUIDE.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [n8n Import Guide](docs/N8N_GUIDE.md)
- [Testing Guide](docs/TESTING_GUIDE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security Audit](docs/SECURITY_AUDIT.md)
- [Production Readiness](docs/PRODUCTION_READINESS.md)

## License

MIT
