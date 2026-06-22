import React from 'react'

interface CardProps {
  children: React.ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
  as?: React.ElementType
}

const PADDING_MAP = {
  none: '0',
  sm:   'var(--space-4)',
  md:   'var(--space-6)',
  lg:   'var(--space-8)',
}

export function Card({
  children,
  padding = 'md',
  className,
  style,
  onClick,
  as: Tag = 'div',
}: CardProps) {
  return (
    <Tag
      className={className}
      onClick={onClick}
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-card)',
        padding: PADDING_MAP[padding],
        ...(onClick ? { cursor: 'pointer' } : {}),
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-5)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      style={{
        fontSize: 'var(--text-md)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--text-primary)',
        lineHeight: 'var(--leading-tight)',
      }}
    >
      {children}
    </h3>
  )
}

export function Divider({ style }: { style?: React.CSSProperties }) {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid var(--surface-border)',
        margin: 'var(--space-4) 0',
        ...style,
      }}
    />
  )
}
