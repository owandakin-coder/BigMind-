/**
 * State machine unit tests — no database required.
 * Tests the TypeScript VALID_TRANSITIONS map in courseStateMachine.ts, which
 * mirrors the deployed validate_state_transition() Postgres function.
 *
 * Run: npm test
 */

import { describe, it, expect } from 'vitest'
import {
  VALID_TRANSITIONS,
  CourseStatus,
  canTransition,
} from '../src/lib/state-machine/courseStateMachine'

const S = CourseStatus

describe('CourseForge AI — State Machine', () => {
  describe('Happy path draft → live', () => {
    const happyPath: [CourseStatus, CourseStatus][] = [
      [S.DRAFT,                 S.MARKET_RESEARCH],
      [S.MARKET_RESEARCH,       S.MARKET_REVIEW],
      [S.MARKET_REVIEW,         S.ARCHITECTURE_DESIGN],
      [S.ARCHITECTURE_DESIGN,   S.ARCHITECTURE_REVIEW],
      [S.ARCHITECTURE_REVIEW,   S.CONTENT_GENERATION],
      [S.CONTENT_GENERATION,    S.CONTENT_REVIEW],
      [S.CONTENT_REVIEW,        S.SALES_PAGE_GENERATION],
      [S.SALES_PAGE_GENERATION, S.SALES_PAGE_REVIEW],
      [S.SALES_PAGE_REVIEW,     S.MARKETING_PREP],
      [S.MARKETING_PREP,        S.MARKETING_REVIEW],
      [S.MARKETING_REVIEW,      S.FINAL_APPROVAL_GATE],
      [S.FINAL_APPROVAL_GATE,   S.PUBLISHING],
      [S.PUBLISHING,            S.LIVE],
      [S.LIVE,                  S.LIVE_ANALYTICS],
    ]
    happyPath.forEach(([from, to]) => {
      it(`allows ${from} → ${to}`, () => expect(canTransition(from, to)).toBe(true))
    })
  })

  describe('Pivot path', () => {
    it('market_review → market_rejected', () => expect(canTransition(S.MARKET_REVIEW, S.MARKET_REJECTED)).toBe(true))
    it('market_rejected → market_pivot', () => expect(canTransition(S.MARKET_REJECTED, S.MARKET_PIVOT)).toBe(true))
    it('market_pivot → market_review', () => expect(canTransition(S.MARKET_PIVOT, S.MARKET_REVIEW)).toBe(true))
  })

  describe('Failure from agent-run stages', () => {
    const failureSources: CourseStatus[] = [
      S.MARKET_RESEARCH, S.ARCHITECTURE_DESIGN, S.CONTENT_GENERATION,
      S.SALES_PAGE_GENERATION, S.MARKETING_PREP, S.PUBLISHING,
    ]
    failureSources.forEach(from => {
      it(`allows ${from} → failed`, () => expect(canTransition(from, S.FAILED)).toBe(true))
    })
  })

  describe('Recovery transitions', () => {
    it('failed → draft', () => expect(canTransition(S.FAILED, S.DRAFT)).toBe(true))
    it('archived → draft', () => expect(canTransition(S.ARCHIVED, S.DRAFT)).toBe(true))
    it('market_rejected → draft', () => expect(canTransition(S.MARKET_REJECTED, S.DRAFT)).toBe(true))
  })

  describe('Illegal transitions (hard blocks)', () => {
    const illegal: [CourseStatus, CourseStatus][] = [
      [S.DRAFT,             S.LIVE],                  // skip the whole pipeline
      [S.DRAFT,             S.FINAL_APPROVAL_GATE],
      [S.DRAFT,             S.PUBLISHING],
      [S.LIVE,              S.DRAFT],                 // cannot go backwards
      [S.FAILED,            S.MARKET_RESEARCH],       // failed only recovers to draft
      [S.MARKET_REVIEW,     S.PUBLISHING],            // skip gates
      [S.MARKET_REVIEW,     S.CONTENT_GENERATION],    // skip architecture
      [S.ARCHITECTURE_REVIEW, S.FAILED],              // review gates do not fail
    ]
    illegal.forEach(([from, to]) => {
      it(`blocks ${from} → ${to}`, () => expect(canTransition(from, to)).toBe(false))
    })
  })

  describe('Enum / transition-map completeness', () => {
    it('exposes 25 course_status values', () => {
      expect(Object.values(CourseStatus).length).toBe(25)
    })
    it('every CourseStatus has a transition entry', () => {
      for (const s of Object.values(CourseStatus)) {
        expect(VALID_TRANSITIONS[s], `${s} missing from VALID_TRANSITIONS`).toBeDefined()
      }
    })
    it('no transition points to an unknown status', () => {
      const known = new Set(Object.values(CourseStatus))
      for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
        for (const t of targets) {
          expect(known.has(t), `${from} → ${t} targets an unknown status`).toBe(true)
        }
      }
    })
  })
})
