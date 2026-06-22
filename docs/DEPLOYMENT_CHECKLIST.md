# CourseForge AI — Deployment Checklist

## 1. Project Root Verification

Before deployment, verify you are inside the real project root.

**Required files/folders:**

- [ ] `package.json`
- [ ] `src/`
- [ ] `supabase/`
- [ ] `supabase/config.toml`
- [ ] `supabase/migrations/`
- [ ] `supabase/functions/`
- [ ] `docs/`
- [ ] `.env.example`

**Commands:**

```bash
pwd
ls
find . -maxdepth 3 -name package.json
find . -maxdepth 3 -name config.toml
find . -maxdepth 3 -type d -name supabase
```

**Status:**

- [ ] Project root confirmed
- [ ] package.json found
- [ ] src/ found
- [ ] supabase/ found
- [ ] docs/ found

---

## 2. Local Environment

**Required tools:**

- [ ] Node.js 20+
- [ ] npm
- [ ] Supabase CLI
- [ ] Git
- [ ] n8n account or self-hosted n8n
- [ ] Supabase project
- [ ] OpenAI API key
- [ ] Anthropic API key

**Commands:**

```bash
node -v
npm -v
supabase -v
git --version
```

**Status:**

- [ ] Node installed
- [ ] npm installed
- [ ] Supabase CLI installed
- [ ] Git installed

---

## 3. Environment Variables

**Create:**

```bash
cp .env.example .env.local
```

**Required variables:**

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
ANTHROPIC_API_KEY=

N8N_WEBHOOK_URL=
ALLOWED_ORIGIN=
```

**Rules:**

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code.
- Only `VITE_` variables can be used client-side.
- `ALLOWED_ORIGIN` must not be `*` in production.

**Status:**

- [ ] .env.local created
- [ ] Supabase URL set
- [ ] Anon key set
- [ ] Service role key set server-side only
- [ ] OpenAI key set
- [ ] Anthropic key set
- [ ] n8n webhook URL set
- [ ] ALLOWED_ORIGIN set correctly

---

## 4. Install Dependencies

**Run:**

```bash
npm install
```

**Then verify:**

```bash
npm run typecheck
npm run build
```

**Status:**

- [ ] npm install passed
- [ ] TypeScript passed
- [ ] Production build passed

---

## 5. Supabase Link

**Login:**

```bash
supabase login
```

**Link project:**

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

**Verify:**

```bash
supabase status
```

**Status:**

- [ ] Supabase login passed
- [ ] Project linked
- [ ] Supabase status works

---

## 6. Database Deployment

**Push migrations:**

```bash
supabase db push
```

**Verify database objects:**

```bash
supabase db remote commit
```

**Check manually in Supabase Dashboard:**

Tables:

- [ ] user_profiles
- [ ] courses
- [ ] course_iterations
- [ ] market_research_documents
- [ ] course_blueprints
- [ ] modules
- [ ] lessons
- [ ] digital_assets
- [ ] approvals
- [ ] agent_logs
- [ ] analytics_events
- [ ] market_embeddings
- [ ] platform_publish_logs
- [ ] plan_definitions
- [ ] dead_letter_queue
- [ ] retry_history
- [ ] agent_metrics

RPCs:

- [ ] validate_state_transition
- [ ] perform_approval_action
- [ ] get_audit_trail
- [ ] check_and_deduct_credits
- [ ] can_generate
- [ ] reset_monthly_credits
- [ ] admin_grant_credits

**Status:**

- [ ] All migrations applied
- [ ] All tables exist
- [ ] All enums exist
- [ ] All RPCs exist
- [ ] All triggers exist
- [ ] RLS enabled on protected tables
- [ ] No duplicate-object migration errors

---

## 7. Supabase Secrets

**Set secrets:**

```bash
supabase secrets set OPENAI_API_KEY="YOUR_OPENAI_KEY"
supabase secrets set ANTHROPIC_API_KEY="YOUR_ANTHROPIC_KEY"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
supabase secrets set N8N_WEBHOOK_URL="YOUR_N8N_WEBHOOK_URL"
supabase secrets set ALLOWED_ORIGIN="https://your-domain.com"
```

**Verify:**

```bash
supabase secrets list
```

**Status:**

- [ ] OPENAI_API_KEY exists
- [ ] ANTHROPIC_API_KEY exists
- [ ] SUPABASE_SERVICE_ROLE_KEY exists
- [ ] N8N_WEBHOOK_URL exists
- [ ] ALLOWED_ORIGIN exists
- [ ] No secret values printed in logs

---

## 8. Deploy Edge Functions

**Deploy:**

```bash
supabase functions deploy execute-agent-workflow
supabase functions deploy export-publishing-package
supabase functions deploy workflow-webhook
```

**Verify:**

```bash
supabase functions list
```

**Status:**

- [ ] execute-agent-workflow deployed
- [ ] export-publishing-package deployed
- [ ] workflow-webhook deployed

---

## 9. n8n Workflow Deployment

**Import workflows from:**

```text
/n8n/workflows/
```

**Expected workflows:**

- [ ] 00_main_orchestrator.json
- [ ] market_research_agent.json
- [ ] course_architect_agent.json
- [ ] content_production_agent.json
- [ ] sales_page_agent.json
- [ ] marketing_agent.json
- [ ] publishing_agent.json
- [ ] analytics_agent.json
- [ ] portfolio_manager_agent.json
- [ ] revenue_intelligence_agent.json
- [ ] seo_agent.json
- [ ] customer_success_agent.json

**Configure credentials:**

- [ ] Supabase URL
- [ ] Supabase service role key
- [ ] Edge Function URL
- [ ] Webhook secret if used

**Status:**

- [ ] Main orchestrator imported
- [ ] All 11 agent workflows imported
- [ ] Credentials configured
- [ ] Webhook URL copied into Supabase/n8n config
- [ ] Test execution works

---

## 10. Frontend Deployment

**Local test:**

```bash
npm run build
npm run preview
```

Deploy to Vercel or another host.

**Required frontend env vars:**

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

**Status:**

- [ ] Local preview works
- [ ] Frontend deployed
- [ ] Env vars configured in hosting platform
- [ ] App loads without console errors
- [ ] Auth works
- [ ] Dashboard loads

---

## 11. Live Auth Test

**Test:**

- [ ] Sign up new user
- [ ] Confirm user_profiles row created
- [ ] Log in
- [ ] Create course
- [ ] Log out
- [ ] Log in as second user
- [ ] Confirm second user cannot access first user's course

**Status:**

- [ ] Signup works
- [ ] Login works
- [ ] Profile row created
- [ ] Course creation works
- [ ] Cross-user access blocked

---

## 12. Live E2E Test

**Run full flow:**

1. Create course idea
2. Move status from `draft` to `market_research`
3. Trigger Market Research Agent
4. Confirm `market_research_documents` row created
5. Confirm approval row created
6. Approve market report
7. Confirm status becomes `architecture_design`
8. Trigger Course Architect Agent
9. Confirm blueprint/modules/lessons created
10. Approve architecture
11. Trigger Content Agent
12. Confirm `digital_assets` created
13. Trigger Sales Agent
14. Trigger Marketing Agent
15. Trigger Publishing Agent
16. Export publishing package

**Status:**

- [ ] Course created
- [ ] Market agent works
- [ ] Approval works
- [ ] Architecture agent works
- [ ] Content agent works
- [ ] Sales agent works
- [ ] Marketing agent works
- [ ] Publishing export works
- [ ] Agent logs created
- [ ] Status transitions valid

---

## 13. Security Verification

**Attempt these attacks:**

- [ ] Client directly updates `courses.status`
- [ ] Client reads another user's course
- [ ] Client inserts into `agent_logs`
- [ ] Client calls `execute-agent-workflow` without JWT
- [ ] Client calls `execute-agent-workflow` for another user's course
- [ ] User exceeds AI credits and tries generation again
- [ ] Client tries to access service role key

**Expected:** All attacks fail.

**Status:**

- [ ] Direct status mutation blocked
- [ ] Cross-user read blocked
- [ ] agent_logs insert blocked
- [ ] Edge Function without JWT blocked
- [ ] Cross-user Edge Function call blocked
- [ ] Credit limit enforced
- [ ] No service role key exposed

---

## 14. Observability Verification

**Verify:**

- [ ] agent_logs populated
- [ ] agent_metrics populated
- [ ] retry_history works
- [ ] dead_letter_queue works
- [ ] failed_workflows view works
- [ ] audit_trail view works

**Status:**

- [ ] Agent logs visible
- [ ] Metrics visible
- [ ] Retry history visible
- [ ] Dead letter queue visible
- [ ] Failed workflows visible
- [ ] Audit trail visible

---

## 15. Publishing Package Verification

**Export for each platform:**

- [ ] Udemy
- [ ] Gumroad
- [ ] Teachable
- [ ] Thinkific
- [ ] Kajabi
- [ ] Podia

**Verify each export includes:**

- [ ] Title
- [ ] Description
- [ ] Modules
- [ ] Lessons
- [ ] Scripts
- [ ] PDFs/workbooks
- [ ] Sales copy
- [ ] SEO metadata
- [ ] Pricing recommendation
- [ ] Platform checklist
- [ ] Validation report

**Status:**

- [ ] Udemy export works
- [ ] Gumroad export works
- [ ] Teachable export works
- [ ] Thinkific export works
- [ ] Kajabi export works
- [ ] Podia export works

---

## 16. Production Readiness

**Run:**

```bash
npm run validate:system
npm run test
npm run build
```

**If available:**

```bash
npm audit
```

**Status:**

- [ ] validate:system passed
- [ ] tests passed
- [ ] build passed
- [ ] dependency audit reviewed
- [ ] no critical security issues

---

## 17. Final Go / No-Go

**Go-Live only if:**

- [ ] Database deployed successfully
- [ ] Edge Functions deployed successfully
- [ ] n8n workflows imported and tested
- [ ] Frontend deployed successfully
- [ ] Auth works
- [ ] E2E flow works
- [ ] RLS verified
- [ ] Security tests passed
- [ ] Publishing export works
- [ ] No exposed secrets
- [ ] No critical errors

**Final status:**

```text
GO LIVE: YES / NO
Reason:
Remaining blockers:
```
