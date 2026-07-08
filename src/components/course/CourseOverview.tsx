'use client'
/**
 * CourseOverview — the workspace's product-led home. Leads with what you're
 * building (title, progress, next action) instead of the raw pipeline console.
 */
import React from 'react'
import { StatusPill } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { PhaseStepper } from './PhaseStepper'
import type { Section } from './CourseSidebar'
import { statusGuidance } from '@/lib/course-status'
import type { CourseStatus } from '@/lib/state-machine/courseStateMachine'

interface CourseOverviewProps {
  title: string
  niche: string
  status: CourseStatus
  credits: number
  canRun: boolean
  runLabel: string
  onRun: () => void
  isLaunching: boolean
  isHITL: boolean
  isLive: boolean
  isFailed: boolean
  onReset: () => void
  isResetting: boolean
  onNavigate: (s: Section) => void
}

function QuickLink({ icon, label, desc, onClick }: { icon: React.ReactNode; label: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="cf-hover-lift" style={{
      display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', textAlign: 'left', cursor: 'pointer',
      background: 'var(--surface-raised)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-4)', width: '100%',
    }}>
      <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)', color: 'var(--color-indigo-300)' }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{desc}</span>
      </span>
    </button>
  )
}

export function CourseOverview(p: CourseOverviewProps) {
  const guidance = statusGuidance(p.status)

  // Which primary action to surface.
  let cta: React.ReactNode = null
  if (p.isFailed) {
    cta = <Button variant="danger" size="lg" loading={p.isResetting} onClick={p.onReset}>Reset & retry</Button>
  } else if (p.isLive) {
    cta = <Button variant="primary" size="lg" onClick={() => p.onNavigate('publish')}>View launch & share →</Button>
  } else if (p.isHITL) {
    cta = <Button variant="primary" size="lg" onClick={() => p.onNavigate('build')}>Review &amp; approve →</Button>
  } else if (p.canRun) {
    cta = (
      <Button variant="primary" size="lg" loading={p.isLaunching} onClick={p.onRun}
        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>}>
        {p.runLabel}
      </Button>
    )
  }

  const ctaHeadline = p.isFailed ? 'The last run failed'
    : p.isLive ? 'Your course is live 🎉'
    : p.isHITL ? 'Your review is needed'
    : p.canRun ? 'Ready for the next step'
    : 'In progress'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Hero card */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl, 20px)', border: '1px solid var(--surface-border)', background: 'var(--surface-raised)' }}>
        <div aria-hidden="true" className="cf-mesh" style={{
          position: 'absolute', inset: 0, opacity: 0.7, pointerEvents: 'none',
          background: 'radial-gradient(70% 120% at 100% 0%, rgba(99,102,241,0.16), transparent 60%), radial-gradient(60% 100% at 0% 100%, rgba(139,92,246,0.10), transparent 60%)',
        }} />
        <div style={{ position: 'relative', padding: 'var(--space-7)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-6)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                <StatusPill status={p.status} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Niche: <span style={{ color: 'var(--text-secondary)' }}>{p.niche}</span></span>
              </div>
              <h1 style={{ fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {p.title}
              </h1>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Credits</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: p.credits >= 0 && p.credits < 50 ? 'var(--color-amber-400)' : 'var(--text-primary)' }}>
                {p.credits < 0 ? '∞' : p.credits.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Journey stepper */}
          <PhaseStepper status={p.status} />

          {/* Next action block */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap',
            marginTop: 'var(--space-6)', padding: 'var(--space-5)', borderRadius: 'var(--radius-lg)',
            background: 'rgba(10,10,15,0.5)', border: '1px solid var(--surface-border)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontWeight: 700, marginBottom: 4 }}>
                Next step
              </div>
              <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 2 }}>{ctaHeadline}</div>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{guidance.nextAction}</div>
            </div>
            {cta && <div style={{ flexShrink: 0 }}>{cta}</div>}
          </div>
        </div>
      </div>

      {/* Quick links to the product */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <QuickLink onClick={() => p.onNavigate('course')} label="Course content" desc="Modules, lessons & scripts — the student view."
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>} />
        <QuickLink onClick={() => p.onNavigate('sales')} label="Sales page" desc="Your publish-ready landing page."
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>} />
        <QuickLink onClick={() => p.onNavigate('marketing')} label="Marketing kit" desc="Threads, carousels, emails & ad copy."
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>} />
        <QuickLink onClick={() => p.onNavigate('build')} label="Build pipeline" desc="Run agents, review gates & activity log."
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>} />
      </div>
    </div>
  )
}
