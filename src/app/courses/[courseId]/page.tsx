'use client'
export const dynamic = 'force-dynamic'
/**
 * Course Workspace — /courses/[courseId]
 *
 * Product-led layout: a left nav rail leads with the course & its assets;
 * the pipeline "Build" console sits lower. The Overview surfaces progress and
 * the single next action. (Inverted from the old console-first tab layout.)
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
import { CourseSidebar, type Section } from '@/components/course/CourseSidebar'
import { CourseOverview } from '@/components/course/CourseOverview'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { TopNav } from '@/components/ui/TopNav'

/* ── Status clarity strip (Build view) ─────────────────────── */
// Plain-language readout: current status · next action · button · last result.

function StatusGuidanceStrip({ courseId, status }: { courseId: string; status: CourseStatus }) {
  const supabase = createBrowserClient()
  const guidance = statusGuidance(status)

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

  const phase = coursePhase(status)
  const pct   = phase.index ? Math.round((phase.index / phase.total) * 100) : 0

  return (
    <div role="status" aria-label="Course status guidance" style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--space-4)',
      padding: 'var(--space-4) var(--space-5)', background: 'var(--surface-raised)',
      border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)',
    }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,0.7fr) minmax(0,1.4fr) minmax(0,1.1fr) minmax(0,1.4fr)', gap: 'var(--space-5)' }}>
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

export default function CourseWorkspace() {
  const params   = useParams<{ courseId: string }>()
  const courseId = params.courseId
  const supabase = createBrowserClient()
  const router   = useRouter()
  const [section, setSection] = useState<Section | null>(null)

  const { data: course, isLoading, error } = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('*').eq('id', courseId).single()
      if (error) throw error
      return data
    },
  })

  useRealtimeCourse(courseId)

  const currentStatus: CourseStatus = (course?.status ?? 'draft') as CourseStatus
  const { data: creditsInfo } = useCredits()
  const credits = creditsInfo?.ai_credits ?? 0

  const { mutate: launchAgent, isPending: isLaunching } = useCourseAgent()
  const handleLaunch = useCallback(() => {
    if (!course?.target_niche) return
    launchAgent({ courseId, niche: course.target_niche })
  }, [launchAgent, courseId, course?.target_niche])

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

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--surface-base)' }}>
        <Spinner size={32} />
      </div>
    )
  }
  if (error || !course) return notFound()

  const isHITLActive = isHumanReview(currentStatus)
  const isLive       = currentStatus === 'live' || currentStatus === 'live_analytics'
  const isFailed     = currentStatus === 'failed'
  const activeSection: Section = section ?? 'overview'

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-base)', display: 'flex', flexDirection: 'column' }}>
      <TopNav context={course.title} />

      <div style={{ display: 'flex', flex: 1, alignItems: 'flex-start' }}>
        <CourseSidebar active={activeSection} onSelect={setSection} status={currentStatus} needsAttention={isHITLActive} />

        <main style={{ flex: 1, minWidth: 0, padding: 'var(--space-7) var(--space-8)' }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            {activeSection === 'overview' && (
              <CourseOverview
                title={course.title}
                niche={course.target_niche}
                status={currentStatus}
                credits={credits}
                canRun={canTriggerAgent(currentStatus)}
                runLabel={`Run ${agentLabel(currentStatus)}`}
                onRun={handleLaunch}
                isLaunching={isLaunching}
                isHITL={isHITLActive}
                isLive={isLive}
                isFailed={isFailed}
                onReset={handleReset}
                isResetting={isResetting}
                onNavigate={setSection}
              />
            )}

            {activeSection === 'course'    && <CoursePreview courseId={courseId} />}
            {activeSection === 'sales'      && <SalesPagePreview courseId={courseId} />}
            {activeSection === 'marketing'  && <MarketingHub courseId={courseId} />}

            {activeSection === 'build' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                <StatusGuidanceStrip courseId={courseId} status={currentStatus} />
                {isFailed && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap',
                    padding: 'var(--space-4) var(--space-5)', background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: 'var(--radius-lg)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      The last agent run failed. Reset the course to <strong style={{ color: 'var(--text-primary)' }}>draft</strong> to start over from Market Research.
                    </span>
                    <Button variant="danger" size="md" loading={isResetting} onClick={handleReset}>Reset to draft</Button>
                  </div>
                )}
                {canTriggerAgent(currentStatus) && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap',
                    padding: 'var(--space-4) var(--space-5)', background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.22)', borderRadius: 'var(--radius-lg)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      Ready to run the <strong style={{ color: 'var(--text-primary)' }}>{agentLabel(currentStatus)}</strong>. This uses AI credits.
                    </span>
                    <Button variant="primary" size="md" loading={isLaunching} onClick={handleLaunch}
                      icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}>
                      {`Run ${agentLabel(currentStatus)}`}
                    </Button>
                  </div>
                )}
                <PipelineVisualizer currentStatus={currentStatus} />
                {isHITLActive && <ApprovalQueue courseId={courseId} status={currentStatus} />}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-6)', alignItems: 'start' }}>
                  <AnalyticsCockpit courseId={courseId} />
                  <AgentLogFeed courseId={courseId} />
                </div>
              </div>
            )}

            {activeSection === 'publish' && (
              isLive ? (
                <LiveSuccess
                  courseId={courseId}
                  onViewCourse={() => router.push(`/courses/${courseId}/preview`)}
                  onViewSales={() => setSection('sales')}
                  onViewMarketing={() => setSection('marketing')}
                />
              ) : (
                <div style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', padding: 'var(--space-8) 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 'var(--space-3)' }}>🚧</div>
                  <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Not published yet</h2>
                  <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-5)' }}>
                    Finish the pipeline — run each agent and approve each stage — to publish your course and unlock the preview link.
                  </p>
                  <Button variant="primary" onClick={() => setSection('build')}>Go to Build</Button>
                </div>
              )
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
