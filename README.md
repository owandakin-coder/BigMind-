# CourseForge AI

An AI-assisted course creation platform that takes a course idea from concept to
publish-ready through a deterministic state-machine pipeline. It is **not** fully
automated: you run one agent per stage and approve a human-in-the-loop (HITL) gate
between stages.

## What It Does

1. You enter a course topic and niche
2. You run each pipeline agent one stage at a time: Market Research → Course
   Architecture → Content Production → Sales Page → Marketing → Publishing
   (the codebase also contains auxiliary agent prompts — analytics, SEO,
   portfolio, etc. — that are not part of the core run path)
3. You approve or reject at the HITL gate after each stage
4. When approved through final approval, the course is published and goes live

## Architecture

```
Next.js 15 (App Router)
  ↓
Supabase (PostgreSQL + pgvector + Realtime + Auth + Storage)
  ↓
Deno Edge Functions (JWT-validated, service-role DB ops)
  ↓
AI Gateway (Groq llama-3.3-70b / llama-3.1-8b, cost metering, credit deduction)
```

> n8n workflow JSONs are included under `n8n/` but the app does **not** require
> n8n — the UI triggers agents directly via the `execute-agent-workflow`
> function. n8n orchestration is not wired/verified in this build.

### Key Numbers
- **25** `course_status` enum values (~21 used in the active flow)
- **7** pipeline agents in the core run path (+ auxiliary prompts not yet wired)
- **20** Supabase migrations
- **4** Edge Functions
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

## Testing & CI

- `npm test` runs Vitest unit tests. `tests/course-flow.test.ts` validates the
  real draft→live flow (status classification, phase progression, required
  actions); `tests/state-machine.test.ts` covers the full transition map
  (happy path, pivots, failures, illegal transitions, enum completeness).
- GitHub Actions (`.github/workflows/ci.yml`) runs `type-check` + `test` on every
  push to `master` and on PRs.

## Current status & known limitations

Honest snapshot — this is an actively-developed project, not a finished product:

- The full draft→live pipeline runs end-to-end and writes real records.
- **Content production:** the written-content stream is reliable; the visual
  (slide) and interactive (quiz) streams do not yet consistently validate on the
  current LLM and may be skipped per-lesson.
- **Status definitions are in sync.** `src/lib/state-machine/courseStateMachine.ts`
  mirrors the DB `course_status` enum + `validate_state_transition()` (25 values,
  full transition map + metadata); `src/lib/course-status.ts` provides the UI
  helper groupings (trigger / review / terminal, phase, guidance). Both are
  covered by unit tests.
- Course deletion is a **soft delete** via the `soft_delete_course` RPC (owner-only;
  never hard-deletes, preserving the immutable `agent_logs`). `transition_course_status`
  is owner-guarded against direct cross-account calls.
- Paid-tier limits (`tier_configs.max_courses = -1` "unlimited") need review
  against the `courses_insert_own` RLS check.
- Sustained LLM use is constrained by Groq free-tier rate limits.

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
