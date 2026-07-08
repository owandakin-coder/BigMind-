'use client'
/**
 * PhaseStepper — clean horizontal journey stepper (8 phases, draft→live).
 * Product-led replacement for reading the raw 21-node DAG. Shows done / active
 * / upcoming with a glowing active node. Pure presentation from course-status.
 */
import React from 'react'
import { coursePhase } from '@/lib/course-status'

const PHASES = ['Market Research', 'Architecture', 'Content', 'Sales Page', 'Marketing', 'Final Approval', 'Publishing', 'Live'] as const

export function PhaseStepper({ status }: { status: string }) {
  const { index } = coursePhase(status)
  const current = index ?? 0 // 0 => nothing active (off-track states)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
      {PHASES.map((name, i) => {
        const n = i + 1
        const done = current > n
        const active = current === n
        const last = i === PHASES.length - 1
        return (
          <div key={name} style={{ display: 'flex', alignItems: 'flex-start', flex: last ? '0 0 auto' : 1, minWidth: 78 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0, width: last ? 78 : 40 }}>
              <span style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                {active && (
                  <span className="cf-pulse" aria-hidden="true" style={{
                    position: 'absolute', inset: -5, borderRadius: '50%',
                    border: '1.5px solid var(--color-indigo-400)',
                  }} />
                )}
                <span style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? 'var(--color-green-500)' : active ? 'linear-gradient(135deg, var(--color-indigo-500), var(--color-violet-500))' : 'var(--surface-sunken)',
                  border: done || active ? 'none' : '1px solid var(--surface-border)',
                  boxShadow: active ? '0 4px 14px rgba(99,102,241,0.45)' : 'none',
                }}>
                  {done
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    : <span style={{ fontSize: 11, fontWeight: 700, color: active ? '#fff' : 'var(--text-tertiary)' }}>{n}</span>}
                </span>
              </span>
              <span style={{
                fontSize: 10, textAlign: 'center', lineHeight: 1.25, maxWidth: 76,
                color: done || active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontWeight: active ? 700 : 500,
              }}>{name}</span>
            </div>
            {!last && (
              <div style={{ flex: 1, height: 2, marginTop: 13, borderRadius: 2, minWidth: 20,
                background: done ? 'var(--color-green-500)' : 'var(--surface-border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
