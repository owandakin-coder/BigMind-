/**
 * ReasoningTrace — renders the agent's step-by-step reasoning from agent_logs.reasoning_trace.
 * Expandable, monospace, colour-coded by step type.
 */
'use client'

import React, { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'

interface TraceStep {
  step: number
  type: 'analysis' | 'decision' | 'action' | 'observation' | 'conclusion'
  content: string
}

interface ReasoningTraceProps {
  /** JSON array of TraceStep, or raw string reasoning, from agent_logs.reasoning_trace */
  trace: TraceStep[] | string | null | undefined
  agentName: string
  durationMs?: number
  loading?: boolean
}

const STEP_COLORS: Record<TraceStep['type'], { color: string; label: string }> = {
  analysis:    { color: 'var(--color-indigo-400)', label: 'Analysis'    },
  decision:    { color: 'var(--color-amber-400)',  label: 'Decision'    },
  action:      { color: 'var(--color-violet-400)', label: 'Action'      },
  observation: { color: 'var(--color-cyan-400)',   label: 'Observation' },
  conclusion:  { color: 'var(--color-green-400)',  label: 'Conclusion'  },
}

function parseTrace(raw: TraceStep[] | string | null | undefined): TraceStep[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // Treat as single plain-text observation
      return [{ step: 1, type: 'observation', content: raw }]
    }
  }
  return []
}

export function ReasoningTrace({ trace, agentName, durationMs, loading = false }: ReasoningTraceProps) {
  const [expanded, setExpanded] = useState(true)
  const steps = parseTrace(trace)

  return (
    <div
      style={{
        background: 'var(--surface-sunken)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: 'var(--space-3) var(--space-4)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-medium)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
          </svg>
          Agent Reasoning — {agentName}
          {loading && <Spinner size={12} />}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          {durationMs != null && <span>{(durationMs / 1000).toFixed(1)}s</span>}
          <span>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms' }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {/* Steps */}
      {expanded && (
        <div style={{ padding: 'var(--space-2) var(--space-4) var(--space-4)' }}>
          {steps.length === 0 && !loading ? (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              No reasoning trace available.
            </p>
          ) : (
            <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {steps.map((step, i) => {
                const meta = STEP_COLORS[step.type] ?? STEP_COLORS.observation
                return (
                  <li key={i} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 'var(--space-2)', alignItems: 'start' }}>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 'var(--weight-semibold)',
                        color: meta.color,
                        paddingTop: 2,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {String(step.step).padStart(2, '0')} {meta.label.slice(0, 3).toUpperCase()}
                    </span>
                    <p
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--text-secondary)',
                        lineHeight: 'var(--leading-relaxed)',
                        fontFamily: 'var(--font-mono)',
                        wordBreak: 'break-word',
                        margin: 0,
                      }}
                    >
                      {step.content}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  )
}
