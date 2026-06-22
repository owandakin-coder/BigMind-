import React from 'react'

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'agent'
  | 'hitl'
  | 'publishing'
  | 'pivot'

const VARIANT_STYLES: Record<BadgeVariant, React.CSSProperties> = {
  default:    { background: 'rgba(120,120,160,0.15)', color: 'var(--color-grey-300)',  border: '1px solid rgba(120,120,160,0.25)' },
  success:    { background: 'rgba(34,197,94,0.12)',   color: 'var(--color-green-400)', border: '1px solid rgba(34,197,94,0.25)'  },
  warning:    { background: 'rgba(245,158,11,0.12)',  color: 'var(--color-amber-400)', border: '1px solid rgba(245,158,11,0.25)' },
  danger:     { background: 'rgba(239,68,68,0.12)',   color: 'var(--color-red-400)',   border: '1px solid rgba(239,68,68,0.25)' },
  info:       { background: 'rgba(59,130,246,0.12)',  color: 'var(--color-blue-400)',  border: '1px solid rgba(59,130,246,0.25)' },
  brand:      { background: 'rgba(99,102,241,0.15)',  color: 'var(--color-indigo-400)',border: '1px solid rgba(99,102,241,0.30)' },
  agent:      { background: 'rgba(99,102,241,0.12)',  color: 'var(--color-indigo-400)',border: '1px solid rgba(99,102,241,0.25)' },
  hitl:       { background: 'rgba(245,158,11,0.12)',  color: 'var(--color-amber-400)', border: '1px solid rgba(245,158,11,0.25)' },
  publishing: { background: 'rgba(6,182,212,0.12)',   color: 'var(--color-cyan-400)',  border: '1px solid rgba(6,182,212,0.25)'  },
  pivot:      { background: 'rgba(244,63,94,0.12)',   color: 'var(--color-rose-400)',  border: '1px solid rgba(244,63,94,0.25)'  },
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  dot?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Badge({ variant = 'default', children, dot = false, className, style }: BadgeProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
        lineHeight: 1.5,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...VARIANT_STYLES[variant],
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'currentColor',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}
