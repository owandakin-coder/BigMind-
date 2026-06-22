/**
 * ApprovalQueue — split-screen HITL interface.
 *
 * ┌─────────────────────────────┬────────────────────────────┐
 * │  LeftPane (60%)             │  RightPane (40%)           │
 * │  Agent Evidence             │  Approval Controls         │
 * │  • MarketReportView         │  • Gate info               │
 * │  • BlueprintView            │  • ApprovalActions         │
 * │  • FinalApprovalGateView    │  • Feedback textarea       │
 * │                             │  • ReasoningTrace          │
 * └─────────────────────────────┴────────────────────────────┘
 *
 * Only rendered when the course is at a HITL gate status.
 */
'use client'

import React, { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CourseStatus } from '@/lib/state-machine/courseStateMachine'
import type { Database } from '@/types/database.types'
import { useApprovalAction } from '@/hooks/useApprovalAction'
import { isHumanReview } from '@/lib/course-status'
import { AgentEvidencePane } from './AgentEvidencePane'
import { ReasoningTrace } from './ReasoningTrace'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { createBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'

type Approval   = Database['public']['Tables']['approvals']['Row']
type AgentLog   = Database['public']['Tables']['agent_logs']['Row']
type MarketDoc  = Database['public']['Tables']['market_research_documents']['Row']
type Blueprint  = Database['public']['Tables']['course_blueprints']['Row']

/* ── Gate metadata ─────────────────────────────────────────── */

interface GateMeta {
  title: string
  description: string
  approveLabel: string
  rejectLabel: string
  approveVariant: 'success' | 'primary'
  requiresFeedbackOnReject: boolean
  showApproveLock?: boolean
}

const GATE_META: Record<string, GateMeta> = {
  market_review: {
    title: 'Market Research Review',
    description: 'Review the AI\'s market analysis. Approve to proceed with course architecture or trigger a pivot if the opportunity looks insufficient.',
    approveLabel: 'Approve Market Research',
    rejectLabel: 'Trigger Pivot',
    approveVariant: 'success',
    requiresFeedbackOnReject: true,
    showApproveLock: true,
  },
  market_pivot: {
    title: 'Pivot Review',
    description: 'The market research agent detected insufficient demand for the original niche. Review the proposed pivot options and approve to restart market research with the new direction.',
    approveLabel: 'Accept Pivot & Restart Research',
    rejectLabel: 'Cancel Course',
    approveVariant: 'primary',
    requiresFeedbackOnReject: false,
  },
  architecture_review: {
    title: 'Blueprint Review',
    description: 'Review the proposed course structure, module breakdown, and lesson sequence. Approve to begin content production.',
    approveLabel: 'Approve Blueprint',
    rejectLabel: 'Reject & Revise',
    approveVariant: 'success',
    requiresFeedbackOnReject: true,
  },
  content_review: {
    title: 'Content Review',
    description: 'Review all generated content assets — written lessons, visual assets, and interactive exercises.',
    approveLabel: 'Approve Content',
    rejectLabel: 'Request Revisions',
    approveVariant: 'success',
    requiresFeedbackOnReject: true,
  },
  sales_page_review: {
    title: 'Sales Page Review',
    description: 'Review the AI-generated sales page copy, headline, hooks, and call-to-action. Approve to proceed to marketing asset creation.',
    approveLabel: 'Approve Sales Page',
    rejectLabel: 'Request Revisions',
    approveVariant: 'success',
    requiresFeedbackOnReject: true,
  },
  marketing_review: {
    title: 'Marketing Assets Review',
    description: 'Review all generated marketing materials — emails, social posts, and ad copy. Approve to proceed to final launch approval.',
    approveLabel: 'Approve Marketing Assets',
    rejectLabel: 'Request Revisions',
    approveVariant: 'success',
    requiresFeedbackOnReject: true,
  },
  final_approval_gate: {
    title: 'Final Approval',
    description: 'This is the last gate before publishing. Review all course components, analytics projections, and sales assets.',
    approveLabel: 'Approve for Publishing',
    rejectLabel: 'Reject',
    approveVariant: 'primary',
    requiresFeedbackOnReject: true,
  },
}

/* ── Approval action buttons ───────────────────────────────── */

interface ApprovalActionsProps {
  courseId: string
  pendingApproval: Approval | null | undefined
  gate: GateMeta
  status: CourseStatus
}

function ApprovalActions({ courseId, pendingApproval, gate, status }: ApprovalActionsProps) {
  const [feedback, setFeedback]       = useState('')
  const [showFeedback, setShowFeedback] = useState(false)

  const { mutate: doAction, isPending } = useApprovalAction(courseId)

  const handleApprove = useCallback(() => {
    if (!pendingApproval) return
    doAction({ approvalId: pendingApproval.id, action: 'approve', feedback: feedback || undefined })
  }, [pendingApproval, doAction, feedback])

  const handleReject = useCallback(() => {
    if (!pendingApproval) return
    if (gate.requiresFeedbackOnReject && !feedback.trim()) {
      setShowFeedback(true)
      return
    }
    const action = status === 'market_review' ? 'pivot' : 'reject'
    doAction({ approvalId: pendingApproval.id, action, feedback: feedback || undefined })
  }, [pendingApproval, doAction, feedback, gate, status])

  if (!pendingApproval) {
    return (
      <div style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
        <Spinner />
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 'var(--space-3)' }}>
          Loading approval record…
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Feedback textarea */}
      {(showFeedback || feedback) && (
        <div>
          <label
            htmlFor="approval-feedback"
            style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)', marginBottom: 'var(--space-2)' }}
          >
            Feedback {gate.requiresFeedbackOnReject && showFeedback ? '(required for rejection)' : '(optional)'}
          </label>
          <textarea
            id="approval-feedback"
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Provide specific feedback for the AI agent…"
            rows={4}
            style={{
              width: '100%',
              background: 'var(--surface-sunken)',
              border: `1px solid ${showFeedback && !feedback.trim() ? 'var(--color-red-500)' : 'var(--surface-border)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              lineHeight: 'var(--leading-relaxed)',
              resize: 'vertical',
              outline: 'none',
            }}
          />
          {showFeedback && !feedback.trim() && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red-400)', marginTop: 4 }}>
              Feedback is required when rejecting.
            </p>
          )}
        </div>
      )}

      {/* Add feedback toggle */}
      {!showFeedback && !feedback && (
        <button
          onClick={() => setShowFeedback(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)',
            textAlign: 'left', padding: 0,
            display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add feedback
        </button>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <Button
          variant={gate.approveVariant}
          size="lg"
          loading={isPending}
          onClick={handleApprove}
          style={{ width: '100%' }}
        >
          {gate.approveLabel}
        </Button>
        {gate.showApproveLock && (
          <Button
            variant="ghost"
            size="md"
            loading={isPending}
            onClick={() => {
              if (!pendingApproval) return
              doAction({ approvalId: pendingApproval.id, action: 'approve_and_lock', feedback: feedback || undefined })
            }}
            style={{ width: '100%' }}
          >
            Approve &amp; Lock (prevent re-generation)
          </Button>
        )}
        <Button
          variant="secondary"
          size="md"
          loading={isPending}
          onClick={() => {
            if (!pendingApproval) return
            if (!feedback.trim()) { setShowFeedback(true); return }
            doAction({ approvalId: pendingApproval.id, action: 'regenerate', feedback })
          }}
          style={{ width: '100%' }}
          title="Re-run the agent with your feedback"
        >
          ↺ Regenerate with Feedback
        </Button>
        <Button
          variant="danger"
          size="md"
          loading={isPending}
          onClick={handleReject}
          style={{ width: '100%' }}
        >
          {gate.rejectLabel}
        </Button>
      </div>
    </div>
  )
}

/* ── Right pane ────────────────────────────────────────────── */

interface RightPaneProps {
  courseId: string
  status: CourseStatus
  gate: GateMeta
  pendingApproval: Approval | null | undefined
  latestAgentLog: AgentLog | null | undefined
}

function RightPane({ courseId, status, gate, pendingApproval, latestAgentLog }: RightPaneProps) {
  return (
    <div
      style={{
        width: '40%',
        minWidth: 320,
        maxWidth: 480,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid var(--surface-border)',
        overflowY: 'auto',
      }}
    >
      {/* Gate header */}
      <div style={{ padding: 'var(--space-6)', borderBottom: '1px solid var(--surface-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          <Badge variant="hitl" dot>HITL Gate</Badge>
          {pendingApproval?.is_pending === false && <Badge variant="success">Resolved</Badge>}
        </div>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
          {gate.title}
        </h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', lineHeight: 'var(--leading-relaxed)' }}>
          {gate.description}
        </p>
      </div>

      {/* Approval actions */}
      {pendingApproval?.is_pending !== false && (
        <div style={{ padding: 'var(--space-6)', borderBottom: '1px solid var(--surface-border)' }}>
          <ApprovalActions
            courseId={courseId}
            pendingApproval={pendingApproval}
            gate={gate}
            status={status}
          />
        </div>
      )}

      {/* Reasoning trace */}
      {latestAgentLog && (
        <div style={{ padding: 'var(--space-6)' }}>
          <ReasoningTrace
            trace={latestAgentLog.reasoning_trace as unknown as Parameters<typeof ReasoningTrace>[0]['trace']}
            agentName={latestAgentLog.agent}
            durationMs={undefined}
          />
        </div>
      )}
    </div>
  )
}

/* ── Main component ────────────────────────────────────────── */

interface ApprovalQueueProps {
  courseId: string
  status: CourseStatus
  className?: string
}

export function ApprovalQueue({ courseId, status, className }: ApprovalQueueProps) {
  const supabase = createBrowserClient()
  const isHITL   = isHumanReview(status)
  const gate     = GATE_META[status]

  // ── Data fetching ───────────────────────────────────────
  const { data: marketDoc } = useQuery({
    queryKey: ['market-doc', courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from('market_research_documents')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .maybeSingle()
      return data ?? null
    },
    enabled: isHITL && (status === 'market_review'),
  })

  const { data: blueprint } = useQuery({
    queryKey: ['blueprint', courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from('course_blueprints')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_active', true)
        .maybeSingle()
      return data ?? null
    },
    enabled: isHITL && status === 'architecture_review',
  })

  const { data: pendingApprovals } = useQuery({
    queryKey: ['pending-approvals', courseId],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_pending_approvals', { p_course_id: courseId })
      // RPC returns approval_id (not id) — normalize to match Approval table shape
      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        id:         row.approval_id ?? row.id,
        is_pending: true,
      }))
    },
    enabled: isHITL,
    refetchInterval: 10_000,
  })

  const { data: latestAgentLog } = useQuery({
    queryKey: ['latest-agent-log', courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
    enabled: isHITL,
  })

  const pendingApproval = pendingApprovals?.[0] ?? null

  if (!isHITL || !gate) {
    return (
      <div className={className} style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 200,
      }}>
        <EmptyState
          title="No pending approval"
          description="The approval queue is empty. It will activate when the course reaches a HITL gate."
        />
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--color-amber-400)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 0 0 1px rgba(245,158,11,0.08), 0 4px 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Top bar */}
      <div style={{
        padding: 'var(--space-3) var(--space-6)',
        background: 'rgba(245,158,11,0.06)',
        borderBottom: '1px solid rgba(245,158,11,0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber-400)" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-amber-400)' }}>
          Human-in-the-Loop Gate — Your action is required to continue
        </span>
      </div>

      {/* Split-screen body */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, maxHeight: 700 }}>
        {/* Left pane — agent evidence */}
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <AgentEvidencePane
            status={status}
            marketDoc={marketDoc}
            blueprint={blueprint}
            latestAgentLog={latestAgentLog}
          />
        </div>

        {/* Right pane — approval controls */}
        <RightPane
          courseId={courseId}
          status={status}
          gate={gate}
          pendingApproval={pendingApproval}
          latestAgentLog={latestAgentLog}
        />
      </div>
    </div>
  )
}
