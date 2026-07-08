'use client'
/**
 * CourseSidebar — vertical navigation rail for the course workspace.
 * Product-led ordering: the course & its assets lead; "Build" (the pipeline
 * ops view) sits lower. Active item marked with a gradient rail + glow.
 */
import React from 'react'
import { coursePhase } from '@/lib/course-status'

export type Section = 'overview' | 'course' | 'sales' | 'marketing' | 'build' | 'publish'

const ICONS: Record<Section, React.ReactNode> = {
  overview:  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  course:    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  sales:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  marketing: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
  build:     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  publish:   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/></svg>,
}

const LABELS: Record<Section, string> = {
  overview: 'Overview', course: 'Course', sales: 'Sales page',
  marketing: 'Marketing', build: 'Build', publish: 'Publish',
}

const ORDER: Section[] = ['overview', 'course', 'sales', 'marketing', 'build', 'publish']

interface CourseSidebarProps {
  active: Section
  onSelect: (s: Section) => void
  status: string
  needsAttention?: boolean // HITL gate active — badge the Build item
}

export function CourseSidebar({ active, onSelect, status, needsAttention }: CourseSidebarProps) {
  const { index, total, name } = coursePhase(status)
  const pct = index ? Math.round((index / total) * 100) : 0

  return (
    <aside style={{
      width: 232, flexShrink: 0, alignSelf: 'stretch',
      borderRight: '1px solid var(--surface-border)',
      background: 'var(--surface-raised)',
      display: 'flex', flexDirection: 'column',
      position: 'sticky', top: 60, height: 'calc(100dvh - 60px)',
    }}>
      <nav style={{ padding: 'var(--space-4) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ORDER.map((s) => {
          const on = active === s
          return (
            <button
              key={s}
              onClick={() => onSelect(s)}
              className="cf-navlink"
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                padding: '10px 12px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
                background: on ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: 'var(--text-sm)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                textAlign: 'left', width: '100%',
              }}
            >
              {on && <span aria-hidden="true" style={{
                position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3,
                background: 'linear-gradient(180deg, var(--color-indigo-400), var(--color-violet-500))',
              }} />}
              <span style={{ color: on ? 'var(--color-indigo-300)' : 'inherit', display: 'flex' }}>{ICONS[s]}</span>
              {LABELS[s]}
              {s === 'build' && needsAttention && (
                <span className="cf-pulse" style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--color-amber-400)', boxShadow: '0 0 8px var(--color-amber-400)' }} />
              )}
            </button>
          )
        })}
      </nav>

      {/* Progress footer */}
      <div style={{ marginTop: 'auto', padding: 'var(--space-4)', borderTop: '1px solid var(--surface-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontWeight: 700 }}>Progress</span>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div className="cf-mesh" style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: 'linear-gradient(90deg, var(--color-indigo-500), var(--color-violet-500), var(--color-indigo-500))', transition: 'width 0.4s ease' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          {index ? `Phase ${index} of ${total} · ${name}` : name}
        </span>
      </div>
    </aside>
  )
}
