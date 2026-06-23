/**
 * Course flow tests — validate the REAL draft->live pipeline as the product
 * actually uses it (src/lib/course-status.ts), matching the deployed
 * validate_state_transition() DB function.
 *
 * NB: this is intentionally separate from state-machine.test.ts, which tests an
 * older/divergent status set in courseStateMachine.ts. These statuses are the
 * real DB enum values used by the agents, RLS, and UI.
 *
 * Run: npm test
 */
import { describe, it, expect } from 'vitest'
import {
  canTriggerAgent,
  isHumanReview,
  isTerminal,
  coursePhase,
  statusGuidance,
  agentLabel,
} from '../src/lib/course-status'

// The real, ordered happy path from draft to live.
const HAPPY_PATH = [
  'draft',
  'market_research',
  'market_review',
  'architecture_design',
  'architecture_review',
  'content_generation',
  'content_review',
  'sales_page_generation',
  'sales_page_review',
  'marketing_prep',
  'marketing_review',
  'final_approval_gate',
  'publishing',
  'live',
] as const

const TRIGGER_STAGES = [
  'draft', 'market_research', 'architecture_design',
  'content_generation', 'sales_page_generation', 'marketing_prep', 'publishing',
]
const REVIEW_GATES = [
  'market_review', 'architecture_review', 'content_review',
  'sales_page_review', 'marketing_review', 'final_approval_gate',
]

describe('CourseForge — real draft→live flow', () => {
  it('classifies every trigger stage as agent-triggerable (and not a review gate)', () => {
    for (const s of TRIGGER_STAGES) {
      expect(canTriggerAgent(s), `${s} should be triggerable`).toBe(true)
      expect(isHumanReview(s), `${s} should not be a review gate`).toBe(false)
    }
  })

  it('classifies every review gate as a HITL gate (and not triggerable)', () => {
    for (const s of REVIEW_GATES) {
      expect(isHumanReview(s), `${s} should be a HITL gate`).toBe(true)
      expect(canTriggerAgent(s), `${s} should not be triggerable`).toBe(false)
    }
  })

  it('treats live as terminal with no required action', () => {
    expect(isTerminal('live')).toBe(true)
    expect(canTriggerAgent('live')).toBe(false)
    expect(isHumanReview('live')).toBe(false)
    expect(statusGuidance('live').button).toBeNull()
  })

  it('gives every trigger stage a "Run <agent>" button and a real agent label', () => {
    for (const s of TRIGGER_STAGES) {
      const g = statusGuidance(s)
      expect(g.button, `${s} should expose a button`).toBeTruthy()
      expect(agentLabel(s), `${s} should map to a named agent`).not.toBe('Agent')
    }
  })

  it('gives every review gate an approve/reject action', () => {
    for (const s of REVIEW_GATES) {
      expect(statusGuidance(s).button, `${s} should expose an approve action`).toMatch(/approve/i)
    }
  })

  it('advances course phase monotonically from 1 to 8 along the happy path', () => {
    const phases = HAPPY_PATH.map(s => coursePhase(s).index)
    expect(phases.every(p => p !== null)).toBe(true)
    for (let i = 1; i < phases.length; i++) {
      expect(phases[i]! >= phases[i - 1]!, `phase should not regress at ${HAPPY_PATH[i]}`).toBe(true)
    }
    expect(coursePhase('draft').index).toBe(1)
    expect(coursePhase('live')).toMatchObject({ index: 8, total: 8, name: 'Live' })
  })

  it('marks off-track states (failed) with no phase number and no button', () => {
    expect(coursePhase('failed').index).toBeNull()
    expect(statusGuidance('failed').button).toBeNull()
  })
})
