/**
 * course-status.ts — Single source of truth for all course status groupings.
 *
 * DB enum: 25 values (migration 0001 + migration 0010)
 * All sets here derive from: validate_state_transition() in migration 0005
 * and the perform_approval_action() HITL gate mappings.
 *
 * Do NOT maintain parallel status arrays in UI components — import from here.
 */

// Statuses where calling execute-agent-workflow is valid (Launch button visible)
export const AGENT_TRIGGER_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'market_research',
  'architecture_design',
  'content_generation',
  'sales_page_generation',
  'marketing_prep',
  'publishing',
])

// Statuses where an agent is actively running (spinner indicator)
export const AGENT_RUNNING_STATUSES: ReadonlySet<string> = new Set([
  'market_research',
  'architecture_design',
  'content_generation',
  'sales_page_generation',
  'marketing_prep',
  'publishing',
  'live_analytics',
])

// Statuses that are HITL gates — require human action before pipeline can advance
// Matches the CASE branches in perform_approval_action() DB function.
export const HUMAN_REVIEW_STATUSES: ReadonlySet<string> = new Set([
  'market_review',
  'market_pivot',
  'architecture_review',
  'content_review',
  'sales_page_review',
  'marketing_review',
  'final_approval_gate',
])

// Terminal statuses — no agent will run, no approval pending, pipeline is done
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'live',
  'live_analytics',
  'paused',
  'archived',
  'failed',
  'market_rejected',
  'architecture_rejected',
])

// Human-readable agent name shown on the Launch button CTA
const AGENT_LABEL: Readonly<Record<string, string>> = {
  draft:                'Market Research Agent',
  market_research:      'Market Research Agent',
  architecture_design:  'Architecture Agent',
  content_generation:   'Content Production Agent',
  sales_page_generation:'Sales Page Agent',
  marketing_prep:       'Marketing Agent',
  publishing:           'Publishing Agent',
}

export function canTriggerAgent(status: string): boolean {
  return AGENT_TRIGGER_STATUSES.has(status)
}

export function isAgentRunning(status: string): boolean {
  return AGENT_RUNNING_STATUSES.has(status)
}

export function isHumanReview(status: string): boolean {
  return HUMAN_REVIEW_STATUSES.has(status)
}

export function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

export function agentLabel(status: string): string {
  return AGENT_LABEL[status] ?? 'Agent'
}

// Ordered, user-facing phases of the draft→live journey. Each phase bundles its
// "run agent" status with its review gate so the user sees linear progress
// instead of 21 raw machine states.
const PHASES = [
  'Market Research', 'Architecture', 'Content',
  'Sales Page', 'Marketing', 'Final Approval', 'Publishing', 'Live',
] as const

const PHASE_OF: Readonly<Record<string, number>> = {
  draft: 1, market_research: 1, market_review: 1, market_pivot: 1, market_rejected: 1,
  architecture_design: 2, architecture_review: 2, architecture_rejected: 2,
  content_generation: 3, content_review: 3,
  sales_page_generation: 4, sales_page_review: 4,
  marketing_prep: 5, marketing_review: 5,
  final_approval_gate: 6,
  publishing: 7,
  live: 8, live_analytics: 8,
}

/**
 * Where the course sits in the linear journey: "Phase 3 of 8 · Content".
 * Returns index=null for off-track states (paused/archived/failed) so the UI
 * can show the status without a misleading step number. Pure derivation.
 */
export function coursePhase(status: string): { index: number | null; total: number; name: string } {
  const total = PHASES.length
  const idx = PHASE_OF[status]
  if (!idx) return { index: null, total, name: status }
  return { index: idx, total, name: PHASES[idx - 1] }
}

/**
 * Human-readable guidance for the current status: what the user must do next
 * and which control performs it. Pure derivation from the sets above — no DB,
 * no side effects. Used by the status-clarity strip on the course page.
 *
 * Note: a trigger status (e.g. architecture_design) means the course is WAITING
 * for the user to click "Run …". It is NOT "agent running" — actual execution is
 * a transient client state (the launch mutation), not a distinct DB status.
 */
export function statusGuidance(status: string): { nextAction: string; button: string | null } {
  if (status === 'draft') {
    return { nextAction: 'Start the workflow to begin market research.', button: 'Launch Workflow' }
  }
  if (canTriggerAgent(status)) {
    return { nextAction: `Stage approved — click to run the ${agentLabel(status)}.`, button: `Run ${agentLabel(status)}` }
  }
  if (isHumanReview(status)) {
    return { nextAction: 'Review the output below and Approve (or Reject) to continue.', button: 'Approve / Reject — in the panel below' }
  }
  if (status === 'live' || status === 'live_analytics') {
    return { nextAction: 'Course is live. No action required.', button: null }
  }
  if (status === 'failed') {
    return { nextAction: 'The last run failed. Reset the course to retry from an earlier stage.', button: null }
  }
  if (isTerminal(status)) {
    return { nextAction: `Pipeline ended (${status}). No action required.`, button: null }
  }
  return { nextAction: 'No action available for this status.', button: null }
}
