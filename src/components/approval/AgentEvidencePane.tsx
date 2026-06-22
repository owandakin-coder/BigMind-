/**
 * AgentEvidencePane — Left pane of the ApprovalQueue split-screen.
 * Renders the appropriate evidence view based on the current HITL gate:
 *   market_review       → MarketReportView
 *   architecture_review → BlueprintView
 *   content_review      → ContentReviewView
 *   final_approval_gate → FinalApprovalGateView
 *   publishing_confirmed→ PublishConfirmView
 *   pivot_review        → PivotReviewView
 */
'use client'

import React from 'react'
import type { CourseStatus } from '@/lib/state-machine/courseStateMachine'
import type { Database } from '@/types/database.types'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

type MarketDoc  = Database['public']['Tables']['market_research_documents']['Row']
type Blueprint  = Database['public']['Tables']['course_blueprints']['Row']
type AgentLog   = Database['public']['Tables']['agent_logs']['Row']

interface AgentEvidencePaneProps {
  status: CourseStatus
  marketDoc?: MarketDoc | null
  blueprint?: Blueprint | null
  latestAgentLog?: AgentLog | null
}

/* ── MarketReportView ──────────────────────────────────────── */

function MarketReportView({ doc }: { doc: MarketDoc }) {
  const data = doc as unknown as Record<string, unknown>

  // Scores/flags are real columns; audience/size live in the pricing_analysis
  // JSONB; keywords/competitors are their own columns (seo_keywords,
  // competitor_analysis). Read each from the correct place.
  const pa = (data?.pricing_analysis as Record<string, unknown>) ?? {}
  const demandScore    = Number(data?.demand_score    ?? 0)
  const opportunityScore = Number(data?.opportunity_score ?? 0)
  const pivotTriggered = Boolean(data?.pivot_triggered)
  const topKeywords    = (data?.seo_keywords as string[])  ?? []
  const targetAudience = (pa?.target_audience as string) ?? '—'
  const marketSize     = (pa?.market_size as string)     ?? '—'
  const competitors    = (data?.competitor_analysis as {name:string;weakness:string}[]) ?? []
  const pivotOptions   = (data?.pivot_options as {title:string;rationale:string}[]) ?? []

  function ScoreBar({ value, label, color }: { value: number; label: string; color: string }) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
          <span>{label}</span>
          <span style={{ fontWeight: 'var(--weight-semibold)', color }}>{value}/100</span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 3, transition: 'width 600ms ease-out' }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
          <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
            Market Research Report
          </h4>
          {pivotTriggered && <Badge variant="pivot" dot>Pivot Required</Badge>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <ScoreBar value={demandScore}      label="Demand Score"      color={demandScore > 60 ? 'var(--color-green-500)' : demandScore > 40 ? 'var(--color-amber-500)' : 'var(--color-red-500)'} />
          <ScoreBar value={opportunityScore} label="Opportunity Score" color={opportunityScore > 60 ? 'var(--color-green-500)' : opportunityScore > 40 ? 'var(--color-amber-500)' : 'var(--color-red-500)'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          {[
            { label: 'Target Audience', value: targetAudience },
            { label: 'Market Size',     value: marketSize },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)' }}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {topKeywords.length > 0 && (
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Keywords</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {topKeywords.map(kw => (
              <Badge key={kw} variant="brand">{kw}</Badge>
            ))}
          </div>
        </div>
      )}

      {competitors.length > 0 && (
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Competitive Gaps</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {competitors.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{c.weakness}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pivotTriggered && pivotOptions.length > 0 && (
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-rose-400)', marginBottom: 'var(--space-2)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pivot Options</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {pivotOptions.map((p, i) => (
              <div key={i} style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-rose-400)', marginBottom: 4 }}>Option {i + 1}: {p.title}</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{p.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── BlueprintView ─────────────────────────────────────────── */

function BlueprintView({ bp }: { bp: Blueprint }) {
  const row = bp as unknown as Record<string, unknown>
  // The architect output is stored in the `core_framework` JSONB column — not as
  // top-level columns. Read from there (with the row columns as fallback).
  const fw = (row?.core_framework as Record<string, unknown>) ?? {}
  const modules = (fw?.modules as { title: string; lessons: { title: string; core_concept: string; is_mvc?: boolean }[] }[]) ?? []
  const learningObjectives = (fw?.learning_objectives as string[]) ?? (row?.learning_outcomes as string[]) ?? []
  const courseTitle = (fw?.course_title as string) ?? bp.course_id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div>
        <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          Course Blueprint
        </h4>
        <p style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>{courseTitle}</p>
      </div>

      {learningObjectives.length > 0 && (
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Learning Objectives</p>
          <ul style={{ paddingLeft: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {learningObjectives.map((obj, i) => (
              <li key={i} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-snug)' }}>{obj}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-3)', fontWeight: 'var(--weight-medium)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {modules.length} Module{modules.length !== 1 ? 's' : ''}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {modules.map((mod, mi) => (
            <div key={mi} style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderBottom: '1px solid var(--surface-border)' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-bold)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  M{String(mi).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{mod.title}</span>
                {mi <= 1 && <Badge variant="brand" style={{ fontSize: 9, padding: '1px 5px' }}>MVC</Badge>}
              </div>
              <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-3)' }}>
                {(mod.lessons ?? []).map((les, li) => (
                  <div key={li} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-2) 0', borderBottom: li < mod.lessons.length - 1 ? '1px solid var(--surface-border-subtle)' : 'none' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 28, paddingTop: 1 }}>
                      L{li + 1}
                    </span>
                    <div>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' }}>{les.title}</p>
                      {les.core_concept && (
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>{les.core_concept}</p>
                      )}
                    </div>
                    {les.is_mvc && <Badge variant="brand" style={{ fontSize: 9, padding: '1px 5px', marginLeft: 'auto', flexShrink: 0 }}>MVC</Badge>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── FinalApprovalGateView ─────────────────────────────────── */

function FinalApprovalGateView({ agentLog }: { agentLog: AgentLog | null | undefined }) {
  const summary = ((agentLog as unknown as Record<string, unknown>)?.['output_summary'] ?? null) as Record<string, unknown> | null

  const sections = [
    { label: 'Market Validated',      key: 'market_validated',      color: 'var(--color-green-400)' },
    { label: 'Blueprint Approved',    key: 'blueprint_approved',    color: 'var(--color-green-400)' },
    { label: 'Content Complete',      key: 'content_complete',      color: 'var(--color-indigo-400)' },
    { label: 'Sales Page Generated',  key: 'sales_page_generated',  color: 'var(--color-indigo-400)' },
    { label: 'Marketing Assets Ready',key: 'marketing_ready',        color: 'var(--color-violet-400)' },
    { label: 'Analytics Reviewed',    key: 'analytics_reviewed',    color: 'var(--color-cyan-400)' },
  ]

  const overallScore = summary?.overall_readiness_score as number | undefined
  const readyToPublish = summary?.ready_to_publish as boolean | undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
          Final Approval Gate
        </h4>
        {readyToPublish != null && (
          <Badge variant={readyToPublish ? 'success' : 'danger'} dot>
            {readyToPublish ? 'Ready to Publish' : 'Issues Found'}
          </Badge>
        )}
      </div>

      {overallScore != null && (
        <div style={{ background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)' }}>Overall Readiness Score</p>
          <p style={{ fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-bold)', color: overallScore >= 80 ? 'var(--color-green-400)' : overallScore >= 60 ? 'var(--color-amber-400)' : 'var(--color-red-400)' }}>
            {overallScore}<span style={{ fontSize: 'var(--text-xl)', color: 'var(--text-tertiary)' }}>/100</span>
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {sections.map(({ label, key, color }) => {
          const val = summary?.[key]
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{label}</span>
              {val == null ? (
                <Badge variant="default">—</Badge>
              ) : (
                <Badge variant={val ? 'success' : 'danger'} dot>
                  {val ? 'Pass' : 'Fail'}
                </Badge>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main component ────────────────────────────────────────── */

export function AgentEvidencePane({ status, marketDoc, blueprint, latestAgentLog }: AgentEvidencePaneProps) {
  const content = () => {
    switch (status as string) {
      case 'market_review':
      case 'pivot_review':
        return marketDoc
          ? <MarketReportView doc={marketDoc} />
          : <EmptyState title="No market data" description="Market research output not found." />

      case 'architecture_review':
        return blueprint
          ? <BlueprintView bp={blueprint} />
          : <EmptyState title="No blueprint" description="Course blueprint not found." />

      case 'content_review':
        return <EmptyState title="Content under review" description="Content assets generated. Review each module before approving." />

      case 'final_approval_gate':
        return <FinalApprovalGateView agentLog={latestAgentLog} />

      case 'publishing_confirmed':
        return (
          <div style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
            <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>🚀</div>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Course is ready to go live
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', maxWidth: 320, margin: '0 auto' }}>
              All agents have completed their work. Confirm publishing to push to selected platforms.
            </p>
          </div>
        )

      default:
        return <EmptyState title="No pending approval" description="There is no active HITL gate for this course right now." />
    }
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--space-6)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      {content()}
    </div>
  )
}
