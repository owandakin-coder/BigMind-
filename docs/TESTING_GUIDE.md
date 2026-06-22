# Testing Guide

## Test Types

| Type | Command | Purpose |
|------|---------|---------|
| Unit | `npm run test` | Component + hook tests |
| E2E Workflow | `npm run test:e2e-workflow` | Full pipeline against real DB |
| System Validation | `npm run validate:system` | Live DB audit (read-only) |
| Seed | `npm run seed` | Create demo data |

---

## E2E Workflow Test

Tests the complete 25-state pipeline from draft to publish-ready.

### Prerequisites

1. Supabase running (local or staging)
2. `.env.local` configured with a test DB
3. `SUPABASE_SERVICE_ROLE_KEY` set (needed for test cleanup)

### Run

```bash
npm run test:e2e-workflow
```

### What It Tests

1. **Initial State** — course created as `draft`, correct schema
2. **Market Research Agent** — status transitions to `market_research`, agent log created
3. **Approve Market Research** — `perform_approval_action` RPC, transitions to `architecture_design`
4. **Course Architect** — blueprint created with modules + lessons
5. **Content Production** — digital assets created (scripts, PDFs, workbooks)
6. **Sales + Marketing + Analytics** — sales page, email sequence, analytics tasks
7. **Publishing Package** — export-publishing-package Edge Function returns valid JSON
8. **Post-Publish Auxiliary Loop** — portfolio entry, revenue tracking, SEO metadata
9. **Data Integrity** — no orphaned records, user isolation enforced
10. **Publish-Ready Validation** — course reaches `live` status

### Test Isolation

Each test run:
- Creates a unique test user (`test-{timestamp}@courseforge-test.com`)
- Deletes the user in `afterAll` (cascades to all course data)
- Uses `PIPELINE_STAGES` fixture constant — never hardcodes status strings

---

## System Validation

```bash
npm run validate:system
```

Read-only live audit. Checks:
- All 10+ tables exist
- 3 RPC functions callable (`perform_approval_action`, `deduct_ai_credits`, `can_generate`)
- Data integrity (no courses without user_profiles, no orphaned approvals)
- RLS enabled on all tables

Exits with code `0` on pass, `1` on any failure.

---

## Seed Data

```bash
npm run seed          # Create demo data
npm run seed:clean    # Delete existing seed data, then re-seed
```

Creates:
- **alice@courseforge-demo.com** — Pro plan, 500 credits, 2 courses
- **bob@courseforge-demo.com** — Starter plan, 100 credits, 1 course
- **carol@courseforge-demo.com** — Enterprise plan, unlimited credits, 1 published course

Useful for manual testing and demos.

---

## Manual Test Scenarios

### Test Credit Exhaustion
1. Set `alice`'s credits to 0 via Supabase Dashboard
2. Try to run an agent — should see "Credits exhausted" error
3. `UpgradeCTA` should appear in the UI

### Test Approval Flow
1. Create a course, advance to `market_research`
2. Trigger Market Research Agent
3. In ApprovalQueue, click "Approve"
4. Verify course transitions to `architecture_design`
5. Try "Reject" — verify notes are required
6. Verify rollback on network error (disconnect and retry)

### Test Publishing Export
```bash
curl -X POST https://YOUR_REF.supabase.co/functions/v1/export-publishing-package \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"courseId":"YOUR_COURSE_ID","platform":"udemy","format":"markdown"}'
```

### Test Rate Limiting (perform-approval-action)
Send >10 requests in 60 seconds — should get `429 Too Many Requests`.

---

## CI

`.github/workflows/ci.yml` runs on every push:
- `npm run type-check`
- `npm run lint`
- `npm run test`

E2E tests are not in CI (require live Supabase). Run them manually before production deploys.
