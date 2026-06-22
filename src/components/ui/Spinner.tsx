import React from 'react'

interface SpinnerProps {
  size?: number
  color?: string
  label?: string
}

export function Spinner({ size = 20, color = 'var(--color-indigo-400)', label = 'Loading…' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'cf-spin 0.75s linear infinite' }}
      >
        <style>{`@keyframes cf-spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray="42" strokeDashoffset="12" />
      </svg>
    </span>
  )
}
