/**
 * StatusPill — maps CourseStatus ENUM values to human-readable labels + color variants.
 * Mirrors the state machine groups defined in courseStateMachine.ts.
 */
import React from 'react'
import { Badge, type BadgeVariant } from './Badge'
import type { CourseStatus } from '@/lib/state-machine/courseStateMachine'

type StatusConfig = {
  label: string
  variant: BadgeVariant
  dot?: boolean
  pulse?: boolean
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // ── Idle ───────────────────────────────────────────────
  draft:                   { label: 'Draft',              variant: 'default' },
  cancelled:               { label: 'Cancelled',          variant: 'danger' },
  failed:                  { label: 'Failed',             variant: 'danger', dot: true },

  // ── Agent running ──────────────────────────────────────
  market_research:         { label: 'Market Research',    variant: 'agent', dot: true, pulse: true },
  course_architecture:     { label: 'Architecting',       variant: 'agent', dot: true, pulse: true },
  content_production:      { label: 'Content Production', variant: 'agent', dot: true, pulse: true },
  sales_page_generation:   { label: 'Sales Page',         variant: 'agent', dot: true, pulse: true },
  marketing_assets:        { label: 'Marketing',          variant: 'agent', dot: true, pulse: true },
  analytics_review:        { label: 'Analytics',          variant: 'agent', dot: true, pulse: true },
  publishing:              { label: 'Publishing',         variant: 'publishing', dot: true, pulse: true },

  // ── HITL gates ─────────────────────────────────────────
  market_review:           { label: 'Awaiting Review',    variant: 'hitl', dot: true },
  architecture_review:     { label: 'Blueprint Review',   variant: 'hitl', dot: true },
  final_approval_gate:     { label: 'Final Approval',     variant: 'hitl', dot: true },
  publishing_confirmed:    { label: 'Publish Confirm',    variant: 'hitl', dot: true },

  // ── Pivot ──────────────────────────────────────────────
  pivot_triggered:         { label: 'Pivot Required',     variant: 'pivot', dot: true, pulse: true },
  pivot_review:            { label: 'Pivot Review',       variant: 'hitl', dot: true },

  // ── Content sub-states ─────────────────────────────────
  written_content:         { label: 'Written Content',    variant: 'agent', dot: true, pulse: true },
  visual_content:          { label: 'Visual Content',     variant: 'agent', dot: true, pulse: true },
  interactive_content:     { label: 'Interactive',        variant: 'agent', dot: true, pulse: true },
  content_review:          { label: 'Content Review',     variant: 'hitl', dot: true },

  // ── Terminal success ───────────────────────────────────
  approved:                { label: 'Approved',           variant: 'success', dot: true },
  published:               { label: 'Published',          variant: 'success', dot: true },
}

// Pulse animation injected once into the document
if (typeof document !== 'undefined') {
  const styleId = 'cf-pulse-animation'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes cf-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
      }
      .cf-pulse { animation: cf-pulse 1.8s ease-in-out infinite; }
    `
    document.head.appendChild(style)
  }
}

interface StatusPillProps {
  status: CourseStatus
  size?: 'sm' | 'md'
  className?: string
}

export function StatusPill({ status, size = 'md', className }: StatusPillProps) {
  const config = STATUS_MAP[status] ?? { label: status, variant: 'default' as BadgeVariant }
  return (
    <Badge
      variant={config.variant}
      dot={config.dot}
      className={[config.pulse ? 'cf-pulse' : '', className ?? ''].join(' ').trim()}
      style={size === 'sm' ? { fontSize: '10px', padding: '1px 6px' } : undefined}
    >
      {config.label}
    </Badge>
  )
}
