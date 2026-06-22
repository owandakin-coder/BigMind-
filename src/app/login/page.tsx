'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode]         = useState<'login' | 'signup'>('login')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [signedUp, setSignedUp] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createBrowserClient()
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.href = '/dashboard'
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setSignedUp(true)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (signedUp) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Check your email</h1>
          <p style={styles.subtitle}>
            We sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account, then come back to log in.
          </p>
          <button style={styles.link} onClick={() => { setSignedUp(false); setMode('login') }}>
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={styles.title}>
            {mode === 'login' ? 'Sign in to CourseForge' : 'Create your account'}
          </h1>
          <p style={styles.subtitle}>
            {mode === 'login' ? 'AI-powered course creation platform' : 'Start building AI-powered courses'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
              required
              minLength={6}
              style={styles.input}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{error}</p>
          )}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            style={styles.link}
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0f',
    padding: 16,
  } as React.CSSProperties,
  card: {
    background: '#12121a',
    border: '1px solid #1e1e2e',
    borderRadius: 12,
    padding: 36,
    width: '100%',
    maxWidth: 420,
  } as React.CSSProperties,
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#f1f5f9',
    margin: '0 0 6px',
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    margin: 0,
  } as React.CSSProperties,
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: 500,
    color: '#94a3b8',
  } as React.CSSProperties,
  input: {
    background: '#0a0a0f',
    border: '1px solid #1e1e2e',
    borderRadius: 8,
    padding: '10px 12px',
    color: '#f1f5f9',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  button: {
    background: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '11px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 4,
  } as React.CSSProperties,
  link: {
    background: 'none',
    border: 'none',
    color: '#6366f1',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
    textDecoration: 'underline',
  } as React.CSSProperties,
}
