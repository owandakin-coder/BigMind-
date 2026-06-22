import React from 'react'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
export type ButtonSize    = 'sm' | 'md' | 'lg'

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary:   {
    background: 'var(--brand-default)',
    color: 'var(--color-white)',
    border: '1px solid transparent',
  },
  secondary: {
    background: 'var(--surface-interactive)',
    color: 'var(--text-primary)',
    border: '1px solid var(--surface-border)',
  },
  ghost:     {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
  },
  danger:    {
    background: 'rgba(239,68,68,0.12)',
    color: 'var(--color-red-400)',
    border: '1px solid rgba(239,68,68,0.25)',
  },
  success:   {
    background: 'rgba(34,197,94,0.12)',
    color: 'var(--color-green-400)',
    border: '1px solid rgba(34,197,94,0.25)',
  },
}

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { height: 32, padding: '0 12px', fontSize: 'var(--text-sm)',  borderRadius: 'var(--radius-sm)' },
  md: { height: 40, padding: '0 16px', fontSize: 'var(--text-base)', borderRadius: 'var(--radius-md)' },
  lg: { height: 48, padding: '0 24px', fontSize: 'var(--text-md)',   borderRadius: 'var(--radius-md)' },
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      disabled={isDisabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        fontFamily: 'var(--font-sans)',
        fontWeight: 'var(--weight-medium)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: `opacity var(--duration-fast), background var(--duration-fast), border-color var(--duration-fast)`,
        outline: 'none',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        ...style,
      }}
      {...props}
    >
      {loading ? (
        <Spinner size={14} color="currentColor" />
      ) : (
        icon && iconPosition === 'left' && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      )}
      {children}
      {!loading && icon && iconPosition === 'right' && (
        <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
      )}
    </button>
  )
}
