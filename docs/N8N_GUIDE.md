# n8n Import Guide

CourseForge AI uses 12 n8n workflows to orchestrate AI agent execution.

## Overview

```
00_main_orchestrator  ← Triggered by Supabase DB webhook on course status change
  ↓
01–11 agent workflows ← Each handles one pipeline stage
  ↓
execute-agent-workflow Edge Function ← Does the actual AI call
```

## Import Steps

### 1. Access n8n

Open your n8n instance (local: `http://localhost:5678`, cloud: your n8n URL).

### 2. Import Workflows

For each file in `n8n/workflows/`, in order:

1. Click **+** (New Workflow) or go to Workflows → Import
2. Paste/upload the JSON file
3. Click **Save**
4. Click **Activate** (toggle in top-right)

Import order matters:
```
00_main_orchestrator.json    ← Import last (references others)
01_market_research.json
02_architecture.json
03_content_production.json
04_sales.json
05_marketing.json
06_analytics.json
07_publishing.json
08_portfolio.json
09_revenue.json
10_seo.json
11_customer_success.json
```

### 3. Configure Credentials

In n8n → Credentials → New:

**HTTP Header Auth** (for Edge Function calls):
- Name: `Supabase Service Role`
- Header Name: `Authorization`
- Header Value: `Bearer YOUR_SERVICE_ROLE_KEY`

**Supabase** (for DB operations in workflows):
- Host: `https://YOUR_REF.supabase.co`
- Service Role Key: `YOUR_SERVICE_ROLE_KEY`

### 4. Update Webhook URLs

In each workflow, find the **HTTP Request** node that calls the Edge Function and update the URL to:

```
https://YOUR_REF.supabase.co/functions/v1/execute-agent-workflow
```

### 5. Set Up Supabase Webhook

In Supabase Dashboard → Database → Webhooks → Create:
- **Name**: `courseforge-status-change`
- **Table**: `courses`
- **Events**: `UPDATE`
- **URL**: Copy the webhook URL from `00_main_orchestrator` in n8n (shown in the Webhook Trigger node)
- **HTTP Method**: `POST`
- **Headers**: Add `x-courseforge-secret: YOUR_WEBHOOK_SECRET`

Set `SUPABASE_WEBHOOK_SECRET` in your `.env.local` and n8n environment to the same value.

## Workflow Architecture

Each agent workflow (01–11) follows this pattern:

```
Webhook Trigger
  → Validate payload (has courseId, userId, agentName)
  → HTTP Request to execute-agent-workflow Edge Function
  → Check response status
  → On success: no action (Edge Function updates DB)
  → On failure: Insert to dead_letter_queue via Supabase node
  → Respond 200
```

The main orchestrator (`00`) routes status transitions to the correct agent workflow via a Switch node keyed on `course.status`.

## Testing Locally

```bash
# Start n8n locally
npx n8n

# In a separate terminal, trigger a test event:
curl -X POST http://localhost:5678/webhook/courseforge-test \
  -H "Content-Type: application/json" \
  -d '{"type":"UPDATE","record":{"id":"TEST_COURSE_ID","status":"market_research","user_id":"TEST_USER_ID"}}'
```
