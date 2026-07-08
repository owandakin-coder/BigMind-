'use client'
/**
 * TopNav — shared branded app bar.
 * Gives every authenticated screen a consistent identity, a home link,
 * and a sign-out control (the app previously had no way to log out).
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: 'var(--radius-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--color-indigo-500), var(--color-violet-500))',
        boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    </span>
  )
}

export function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        background: 'none', border: 'none', cursor: onClick ? 'pointer' : 'default', padding: 0,
      }}
    >
      <BrandMark />
      <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
        CourseForge<span className="cf-gradient-text"> AI</span>
      </span>
    </button>
  )
}

interface TopNavProps {
  /** Breadcrumb / context shown to the right of the wordmark (e.g. a course title). */
  context?: React.ReactNode
  /** Optional extra controls rendered before the sign-out button. */
  actions?: React.ReactNode
}

export function TopNav({ context, actions }: TopNavProps) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await createBrowserClient().auth.signOut()
    } finally {
      window.location.href = '/login'
    }
  }

  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
        height: 60, padding: '0 var(--space-6)',
        background: 'rgba(10,10,15,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--surface-border)',
        position: 'sticky', top: 0, zIndex: 50,
      }}
    >
      <Wordmark onClick={() => router.push('/dashboard')} />

      {context && (
        <>
          <span style={{ color: 'var(--surface-border)', fontSize: 'var(--text-lg)' }} aria-hidden="true">/</span>
          <div style={{ minWidth: 0, flex: 1, color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {context}
          </div>
        </>
      )}

      <div style={{ marginLeft: context ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
        {actions}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="cf-navlink"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
            background: 'none', border: '1px solid var(--surface-border)',
            borderRadius: 'var(--radius-sm)', padding: '6px 12px',
            color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {signingOut ? '…' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}
