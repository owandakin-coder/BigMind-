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
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // If email confirmation is off, Supabase returns a session immediately.
        if (data.session) { window.location.href = '/dashboard'; return }
        setSignedUp(true)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.glow} aria-hidden="true" />

      <main style={S.shell}>
        {/* Brand */}
        <div style={S.brand}>
          <span style={S.mark} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <span style={S.wordmark}>CourseForge<span style={S.wordmarkAccent}> AI</span></span>
        </div>

        {signedUp ? (
          <div style={S.card} role="status">
            <h1 style={S.title}>Check your email</h1>
            <p style={S.subtitle}>
              We sent a confirmation link to <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>. Click it to activate your account, then come back to sign in.
            </p>
            <button style={S.linkBtn} onClick={() => { setSignedUp(false); setMode('login') }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <div style={S.card}>
            <h1 style={S.title}>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
            <p style={S.subtitle}>
              {mode === 'login'
                ? 'Sign in to build and launch AI-powered courses.'
                : 'Turn one idea into a complete course — content, sales page, and marketing.'}
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
              <div style={S.field}>
                <label htmlFor="email" style={S.label}>Email</label>
                <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus autoComplete="email" style={S.input} />
              </div>
              <div style={S.field}>
                <label htmlFor="password" style={S.label}>Password</label>
                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'} required minLength={6}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} style={S.input} />
              </div>

              {error && <p role="alert" style={S.error}>{error}</p>}

              <button type="submit" disabled={loading} style={{ ...S.button, opacity: loading ? 0.7 : 1, cursor: loading ? 'default' : 'pointer' }}>
                {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p style={S.switch}>
              {mode === 'login' ? "New here? " : 'Already have an account? '}
              <button style={S.linkBtn} onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}>
                {mode === 'login' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
          </div>
        )}

        <p style={S.footnote}>AI course creation — from idea to live in minutes.</p>
      </main>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: {
    position: 'relative', minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--surface-base)', padding: 'var(--space-6)', overflow: 'hidden',
  },
  glow: {
    position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
    width: 900, height: 600, pointerEvents: 'none',
    background: 'radial-gradient(circle at 50% 40%, rgba(99,102,241,0.22), rgba(139,92,246,0.10) 35%, transparent 70%)',
    filter: 'blur(8px)',
  },
  shell: { position: 'relative', width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  brand: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' },
  mark: {
    width: 36, height: 36, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, var(--color-indigo-500), var(--color-violet-500))', boxShadow: '0 6px 20px rgba(99,102,241,0.35)',
  },
  wordmark: { fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.01em' },
  wordmarkAccent: {
    background: 'linear-gradient(135deg, var(--color-indigo-300), var(--color-violet-400))',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  },
  card: {
    width: '100%', background: 'var(--surface-raised)', border: '1px solid var(--surface-border)',
    borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', boxShadow: 'var(--shadow-lg)',
  },
  title: { fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', margin: '0 0 var(--space-2)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 'var(--leading-relaxed)' },
  field: { display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' },
  label: { fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--text-secondary)' },
  input: {
    background: 'var(--surface-sunken)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)',
    padding: '11px 14px', color: 'var(--text-primary)', fontSize: 'var(--text-base)', outline: 'none', width: '100%',
    fontFamily: 'var(--font-sans)',
  },
  error: { fontSize: 'var(--text-sm)', color: 'var(--text-danger)', margin: 0, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' },
  button: {
    background: 'linear-gradient(135deg, var(--color-indigo-500), var(--color-indigo-600))', color: '#fff', border: 'none',
    borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)',
    width: '100%', marginTop: 'var(--space-1)', boxShadow: '0 6px 18px rgba(99,102,241,0.30)',
  },
  switch: { marginTop: 'var(--space-5)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' },
  linkBtn: { background: 'none', border: 'none', color: 'var(--color-indigo-400)', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', padding: 0 },
  footnote: { marginTop: 'var(--space-6)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' },
}
