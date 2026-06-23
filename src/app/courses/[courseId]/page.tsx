'use client'
export const dynamic = 'force-dynamic'
/**
 * Creator Command Center — /courses/[courseId]
 *
 * Layout (desktop, 1440px+):
 * ┌──────────────────────────────────────────────────────────┐
 * │ Header: course title · status pill · launch button       │
 * ├──────────────────────────────────────────────────────────┤
 * │ PipelineVisualizer (full width)                          │
 * ├──────────────────────────────────────────────────────────┤
 * │ ApprovalQueue (shown when HITL gate active, full width)  │
 * ├────────────────────────────┬─────────────────────────────┤
 * │ AnalyticsCockpit (60%)     │ AgentLogFeed (40%)          │
 * └────────────────────────────┴─────────────────────────────┘
 */

import React, { useCallback, useState } from 'react'
import { useParams, notFound, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import { useRealtimeCourse } from '@/hooks/useRealtimeCourse'
import { useCourseAgent } from '@/hooks/useCourseAgent'
import { useCredits } from '@/hooks/useCredits'
import { canTriggerAgent, isHumanReview, agentLabel, statusGuidance, coursePhase } from '@/lib/course-status'
import type { CourseStatus } from '@/lib/state-machine/courseStateMachine'
import { PipelineVisualizer } from '@/components/pipeline/PipelineVisualizer'
import { ApprovalQueue } from '@/components/approval/ApprovalQueue'
import { AnalyticsCockpit } from '@/components/analytics/AnalyticsCockpit'
import { AgentLogFeed } from '@/components/pipeline/AgentLogFeed'
import { CoursePreview } from '@/components/preview/CoursePreview'
import { SalesPagePreview } from '@/components/preview/SalesPagePreview'
import { MarketingHub } from '@/components/preview/MarketingHub'
import { LiveSuccess } from '@/components/preview/LiveSuccess'
import { StatusPill } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

/* ── Header ────────────────────────────────────────────────── */

interface CommandCenterHeaderProps {
  courseId: string
  title: string
  niche: string
  status: CourseStatus
  onLaunch: () => void
  isLaunching: boolean
  credits: number
}

function CommandCenterHeader({ courseId, title, niche, status, onLaunch, isLaunching, credits }: CommandCenterHeaderProps) {
  // "Agent running" reflects ACTUAL execution (the launch mutation in flight),
  // not the status — a trigger status like architecture_design means the course
  // is WAITING for a click, not running. (Fixes the false "Agent running" glitch.)
  const isRunning = isLaunching
  const isHITL    = isHumanReview(status)
  const canLaunch = canTriggerAgent(status)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-5)',
      padding: 'var(--space-5) var(--space-8)',
      background: 'var(--surface-raised)',
      borderBottom: '1px solid var(--surface-border)',
      position: 'sticky',
      top: 0,
      zIndex: 'var(--z-raised)',
    }}>
      {/* Course info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 4 }}>
          <h1 style={{
            fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {title}
          </h1>
          <StatusPill status={status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            Niche: <span style={{ color: 'var(--text-secondary)' }}>{niche}</span>
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            ID: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{courseId.slice(0, 8)}</code>
          </span>
          {isRunning && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-indigo-400)' }}>
              <Spinner size={10} color="var(--color-indigo-400)" />
              Agent running — this can take up to a minute…
            </span>
          )}
        </div>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Credits remaining</p>
          <p style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: credits < 50 ? 'var(--color-amber-400)' : 'var(--text-primary)' }}>
            {credits < 0 ? '∞' : credits.toLocaleString()}
          </p>
        </div>
        {canLaunch && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-2)' }}>
            {status !== 'draft' && !isLaunching && (
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-green-400)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
              }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-green-400)" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Stage approved — ready to continue
              </span>
            )}
            <Button
              variant="primary"
              size="lg"
              loading={isLaunching}
              onClick={onLaunch}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
              }
            >
              {`Run ${agentLabel(status)}`}
            </Button>
          </div>
        )}
        {isHITL && (
          <Badge variant="hitl" dot style={{ fontSize: 12, padding: '6px 12px' }}>
            Action required
          </Badge>
        )}
      </div>
    </div>
  )
}

/* ── Status clarity strip ──────────────────────────────────── */
// Plain-language readout of where the course is and what to do next:
// current status · next required action · which button · last agent result.

interface StatusGuidanceStripProps {
  courseId: string
  status: CourseStatus
}

function StatusGuidanceStrip({ courseId, status }: StatusGuidanceStripProps) {
  const supabase = createBrowserClient()
  const guidance = statusGuidance(status)

  // Last agent run outcome (most recent completion or error)
  const { data: lastResult } = useQuery({
    queryKey: ['last-agent-result', courseId, status],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_logs')
        .select('agent, event_type, to_status, error_message, created_at')
        .eq('course_id', courseId)
        .in('event_type', ['execution_complete', 'error'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data ?? null
    },
    refetchInterval: 10_000,
  })

  const isError = lastResult?.event_type === 'error'
  const resultText = !lastResult
    ? 'No agent has run yet'
    : isError
      ? `${lastResult.agent} failed${lastResult.error_message ? ` — ${String(lastResult.error_message).slice(0, 90)}` : ''}`
      : `${lastResult.agent} completed → ${lastResult.to_status ?? '—'}`

  const cellStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }
  const labelStyle: React.CSSProperties = {
    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--text-tertiary)', fontWeight: 'var(--weight-semibold)',
  }
  const valueStyle: React.CSSProperties = {
    fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  }

  // Linear progress through the journey (F3: "where am I, how far to go")
  const phase = coursePhase(status)
  const pct   = phase.index ? Math.round((phase.index / phase.total) * 100) : 0

  return (
    <div
      role="status"
      aria-label="Course status guidance"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: 'var(--space-4) var(--space-5)',
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {/* Phase progress + stepwise explanation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>
            {phase.index ? `Phase ${phase.index} of ${phase.total} · ${phase.name}` : phase.name}
          </span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            Each stage is a manual step — run the agent, then approve, to advance.
          </span>
        </div>
        <div style={{ height: 6, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-indigo-400)', borderRadius: 3, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Current status · next action · required button · last result */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px,0.7fr) minmax(0,1.4fr) minmax(0,1.1fr) minmax(0,1.4fr)',
        gap: 'var(--space-5)',
      }}>
        <div style={cellStyle}>
          <span style={labelStyle}>Current status</span>
          <span style={{ ...valueStyle, fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-bold)' }}>{status}</span>
        </div>
        <div style={cellStyle}>
          <span style={labelStyle}>Next required action</span>
          <span style={{ ...valueStyle, whiteSpace: 'normal' }}>{guidance.nextAction}</span>
        </div>
        <div style={cellStyle}>
          <span style={labelStyle}>Required button</span>
          <span style={{ ...valueStyle, color: guidance.button ? 'var(--color-indigo-400)' : 'var(--text-tertiary)' }}>
            {guidance.button ?? '—'}
          </span>
        </div>
        <div style={cellStyle}>
          <span style={labelStyle}>Last agent result</span>
          <span style={{ ...valueStyle, color: isError ? 'var(--color-red-400)' : lastResult ? 'var(--color-green-400)' : 'var(--text-tertiary)' }}>
            {resultText}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────────── */

type TabId = 'workflow' | 'course' | 'assets' | 'publish'

export default function CourseCommandCenter() {
  const params   = useParams<{ courseId: string }>()
  const courseId = params.courseId
  const supabase = createBrowserClient()
  const router   = useRouter()
  const [tab, setTab] = useState<TabId | null>(null)

  // ── Fetch course ──────────────────────────────────────────
  const { data: course, isLoading, error } = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single()
      if (error) throw error
      return data
    },
  })

  // ── Real-time (updates query cache in place) ─────────────
  useRealtimeCourse(courseId)

  // ── Current status ────────────────────────────────────────
  const currentStatus: CourseStatus = (course?.status ?? 'draft') as CourseStatus

  // ── Credits ───────────────────────────────────────────────
  const { data: creditsInfo } = useCredits()
  const credits = creditsInfo?.ai_credits ?? 0

  // ── Launch workflow ───────────────────────────────────────
  const { mutate: launchAgent, isPending: isLaunching } = useCourseAgent()

  const handleLaunch = useCallback(() => {
    if (!course?.target_niche) return
    launchAgent({ courseId, niche: course.target_niche })
  }, [launchAgent, courseId, course?.target_niche])

  // ── Reset a failed course back to draft (F5: failed was a dead-end) ──
  // Uses the existing transition_course_status RPC (failed→draft is a valid
  // state-machine transition). No agents/workflows/policies changed.
  const queryClient = useQueryClient()
  const { mutate: resetCourse, isPending: isResetting } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('transition_course_status', {
        p_course_id:  courseId,
        p_new_status: 'draft',
        p_actor_id:   (course?.owner_id as string) ?? 'user_reset',
      })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
  })

  const handleReset = useCallback(() => {
    if (window.confirm('Reset this course to draft?\n\nThis clears the failed run so you can start over from Market Research. Generated drafts remain in the database.')) {
      resetCourse()
    }
  }, [resetCourse])

  // ── Loading / error states ────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--surface-base)' }}>
        <Spinner size={32} />
      </div>
    )
  }

  if (error || !course) {
    return notFound()
  }

  const isHITLActive = isHumanReview(currentStatus)
  const isLive       = currentStatus === 'live' || currentStatus === 'live_analytics'
  const activeTab: TabId = tab ?? (isLive ? 'publish' : 'workflow')

  const TABS: { id: TabId; label: string }[] = [
    { id: 'workflow', label: 'Workflow' },
    { id: 'course',   label: 'Course' },
    { id: 'assets',   label: 'Assets' },
    { id: 'publish',  label: 'Publish' },
  ]

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <CommandCenterHeader
        courseId={courseId}
        title={course.title}
        niche={course.target_niche}
        status={currentStatus}
        onLaunch={handleLaunch}
        isLaunching={isLaunching}
        credits={credits}
      />

      {/* Tab navigation */}
      <nav style={{ display: 'flex', gap: 'var(--space-1)', padding: '0 var(--space-8)', borderBottom: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
        {TABS.map(t => {
          const on = activeTab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: 'var(--space-3) var(--space-4)', fontSize: 'var(--text-sm)',
              fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
              color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
              borderBottom: on ? '2px solid var(--color-indigo-400)' : '2px solid transparent',
              marginBottom: -1,
            }}>{t.label}</button>
          )
        })}
      </nav>

      {/* Body */}
      <main style={{ flex: 1, padding: 'var(--space-6) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {activeTab === 'workflow' && (
          <>
            <StatusGuidanceStrip courseId={courseId} status={currentStatus} />
            {currentStatus === 'failed' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 'var(--space-4)', flexWrap: 'wrap',
                padding: 'var(--space-4) var(--space-5)',
                background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)',
                borderRadius: 'var(--radius-lg)',
              }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  The last agent run failed. Reset the course to <strong style={{ color: 'var(--text-primary)' }}>draft</strong> to start over from Market Research.
                </span>
                <Button variant="danger" size="md" loading={isResetting} onClick={handleReset}>
                  Reset to draft
                </Button>
              </div>
            )}
            <PipelineVisualizer currentStatus={currentStatus} />
            {isHITLActive && <ApprovalQueue courseId={courseId} status={currentStatus} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-6)', alignItems: 'start' }}>
              <AnalyticsCockpit courseId={courseId} />
              <AgentLogFeed courseId={courseId} />
            </div>
          </>
        )}

        {activeTab === 'course' && <CoursePreview courseId={courseId} />}

        {activeTab === 'assets' && (
          <>
            <SalesPagePreview courseId={courseId} />
            <div style={{ height: 1, background: 'var(--surface-border)' }} />
            <MarketingHub courseId={courseId} />
          </>
        )}

        {activeTab === 'publish' && (
          isLive ? (
            <LiveSuccess
              courseId={courseId}
              onViewCourse={() => router.push(`/courses/${courseId}/preview`)}
              onViewSales={() => setTab('assets')}
              onViewMarketing={() => setTab('assets')}
            />
          ) : (
            <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: 'var(--space-8) 0' }}>
              <div style={{ fontSize: 40, marginBottom: 'var(--space-3)' }}>🚧</div>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Not published yet</h2>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-5)' }}>
                Finish the workflow — run each agent and approve each stage — to publish your course and unlock the preview link.
              </p>
              <Button variant="primary" onClick={() => setTab('workflow')}>Go to workflow</Button>
            </div>
          )
        )}
      </main>
    </div>
  )
}
