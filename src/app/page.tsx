'use client'
/**
 * Landing page — public marketing front door at `/`.
 * Hero + features + how-it-works + CTA. Dependency-free motion (CSS + Reveal).
 */
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/client'
import { BrandMark } from '@/components/ui/TopNav'
import { Reveal } from '@/components/ui/Reveal'

/* ── Small building blocks ─────────────────────────────────── */

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="cf-hover-lift" style={{
      background: 'var(--surface-raised)', border: '1px solid var(--surface-border)',
      borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)',
      display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', height: '100%',
    }}>
      <span style={{
        width: 44, height: 44, borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--color-indigo-300)',
      }}>{icon}</span>
      <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{title}</h3>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{body}</p>
    </div>
  )
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
      <span style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, var(--color-indigo-500), var(--color-violet-500))',
        color: '#fff', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-base)',
        boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
      }}>{n}</span>
      <div>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 4 }}>{title}</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{body}</p>
      </div>
    </div>
  )
}

/* Floating product mock shown in the hero. */
function PipelineMock() {
  const stages = [
    { name: 'Market Research', done: true },
    { name: 'Course Blueprint', done: true },
    { name: 'Curriculum & Scripts', done: true },
    { name: 'Sales Page', done: false, active: true },
    { name: 'Marketing Kit', done: false },
    { name: 'Publish', done: false },
  ]
  return (
    <div className="cf-float" style={{
      width: '100%', maxWidth: 420,
      background: 'rgba(20,20,28,0.72)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-xl, 20px)',
      boxShadow: '0 30px 80px rgba(0,0,0,0.5)', padding: 'var(--space-6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-5)' }}>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>Building your course</span>
        <span className="cf-pulse" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--color-indigo-300)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-indigo-400)' }} /> Phase 4 of 6
        </span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden', marginBottom: 'var(--space-5)' }}>
        <div className="cf-mesh" style={{ height: '100%', width: '58%', borderRadius: 3, background: 'linear-gradient(90deg, var(--color-indigo-500), var(--color-violet-500), var(--color-indigo-500))' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {stages.map((s) => (
          <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? 'var(--color-green-500)' : s.active ? 'rgba(99,102,241,0.18)' : 'var(--surface-sunken)',
              border: s.active ? '1px solid var(--color-indigo-400)' : '1px solid var(--surface-border)',
            }}>
              {s.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>}
              {s.active && <span className="cf-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-indigo-400)' }} />}
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: s.done || s.active ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: s.active ? 'var(--weight-medium)' : 'var(--weight-regular)' }}>{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Page ──────────────────────────────────────────────────── */

export default function LandingPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    createBrowserClient().auth.getSession().then(({ data }) => setAuthed(!!data.session))
  }, [])

  const goStart = () => router.push(authed ? '/dashboard' : '/login')
  const ctaLabel = authed ? 'Go to dashboard' : 'Start free'

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-base)', overflowX: 'hidden' }}>
      {/* Nav */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50, height: 64, display: 'flex', alignItems: 'center',
        padding: '0 var(--space-6)', background: 'rgba(10,10,15,0.7)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--surface-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <BrandMark />
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            CourseForge<span className="cf-gradient-text"> AI</span>
          </span>
        </div>
        <nav style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
          <a href="#features" className="cf-navlink cf-landing-nav-links" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', textDecoration: 'none' }}>Features</a>
          <a href="#how" className="cf-navlink cf-landing-nav-links" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', textDecoration: 'none' }}>How it works</a>
          <button onClick={goStart} className="cf-btn cf-btn-primary" style={{
            border: 'none', color: '#fff', borderRadius: 'var(--radius-sm)', padding: '9px 18px',
            fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
          }}>{ctaLabel}</button>
        </nav>
      </header>

      {/* Hero */}
      <section style={{ position: 'relative', padding: 'clamp(48px, 9vw, 120px) var(--space-6) 80px' }}>
        <div className="cf-mesh" aria-hidden="true" style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.9,
          background: 'radial-gradient(60% 55% at 50% 20%, rgba(99,102,241,0.22), transparent 60%), radial-gradient(50% 45% at 80% 30%, rgba(139,92,246,0.16), transparent 60%), radial-gradient(45% 45% at 15% 40%, rgba(59,130,246,0.12), transparent 60%)',
        }} />
        <div className="cf-hero-grid" style={{
          position: 'relative', maxWidth: 1120, margin: '0 auto', display: 'grid',
          gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', gap: 'var(--space-8)', alignItems: 'center',
        }}>
          <div className="cf-animate-fade-up">
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-5)',
              padding: '6px 14px', borderRadius: 'var(--radius-pill)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
              background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', color: 'var(--color-indigo-300)',
            }}>
              <span className="cf-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-indigo-400)' }} />
              AI course factory · human-in-the-loop
            </span>
            <h1 style={{ fontSize: 'clamp(34px, 5.5vw, 60px)', lineHeight: 1.05, fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.03em', marginBottom: 'var(--space-5)' }}>
              From one idea to a course that <span className="cf-gradient-text">sells</span> — in minutes.
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2vw, 19px)', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 540, marginBottom: 'var(--space-7)' }}>
              CourseForge AI researches your niche, writes the full curriculum, builds your sales page, and generates a complete marketing kit. You approve every step.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button onClick={goStart} className="cf-btn cf-btn-primary" style={{
                border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', padding: '14px 28px',
                fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
              }}>{ctaLabel} →</button>
              <a href="#how" className="cf-btn cf-btn-secondary" style={{
                display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
                background: 'var(--surface-interactive)', border: '1px solid var(--surface-border)', color: 'var(--text-primary)',
                borderRadius: 'var(--radius-md)', padding: '14px 28px', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-medium)',
              }}>See how it works</a>
            </div>
            <div className="cf-hero-stats" style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-7)', flexWrap: 'wrap' }}>
              {[['6-stage', 'guided pipeline'], ['Every step', 'you approve'], ['Minutes', 'not weeks']].map(([a, b]) => (
                <div key={a}>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>{a}</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{b}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="cf-animate-fade-in" style={{ display: 'flex', justifyContent: 'center' }}>
            <PipelineMock />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" style={{ padding: '40px var(--space-6) 80px', maxWidth: 1120, margin: '0 auto' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: 'var(--space-8)' }}>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Everything a course needs — <span className="cf-gradient-text">generated for you</span>
            </h2>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-tertiary)', marginTop: 'var(--space-3)', maxWidth: 560, margin: 'var(--space-3) auto 0' }}>
              Not just an outline. A complete, launch-ready product — with you in control at every gate.
            </p>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-5)' }}>
          {[
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>, title: 'Market-validated ideas', body: 'Every course starts with real market research — demand, positioning, and pricing — not guesswork.' },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>, title: 'Full curriculum, written', body: 'Modules, lessons, and teaching scripts generated end to end — ready to teach or drop into any platform.' },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>, title: 'Sales page that converts', body: 'A publish-ready sales page — headline, offer, benefits, and FAQ — tuned to your niche and price.' },
            { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>, title: 'Complete marketing kit', body: 'Twitter threads, LinkedIn carousels, emails, and ad copy — generated and ready to copy & post.' },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 80}><FeatureCard {...f} /></Reveal>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" style={{ padding: '40px var(--space-6) 80px' }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <Reveal>
            <h2 style={{ textAlign: 'center', fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--space-8)' }}>
              How it works
            </h2>
          </Reveal>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {[
              { title: 'Describe your idea', body: 'Give it a niche and a sentence. That is all it needs to start researching and planning.' },
              { title: 'AI builds — you approve', body: 'Watch each stage run in a guided pipeline. Review the work, then approve to advance. Nothing ships without you.' },
              { title: 'Publish & share', body: 'Go live and get a student-ready course, a sales page, a marketing kit, and a shareable preview link.' },
            ].map((s, i) => (
              <Reveal key={s.title} delay={i * 80}><Step n={i + 1} {...s} /></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ padding: '40px var(--space-6) 100px' }}>
        <Reveal>
          <div style={{
            position: 'relative', overflow: 'hidden', maxWidth: 880, margin: '0 auto', textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(139,92,246,0.10))',
            border: '1px solid rgba(99,102,241,0.28)', borderRadius: 'var(--radius-xl, 20px)', padding: 'clamp(32px, 6vw, 64px) var(--space-6)',
          }}>
            <div className="cf-mesh" aria-hidden="true" style={{
              position: 'absolute', inset: 0, opacity: 0.6, pointerEvents: 'none',
              background: 'radial-gradient(50% 60% at 50% 0%, rgba(99,102,241,0.25), transparent 70%)',
            }} />
            <div style={{ position: 'relative' }}>
              <h2 style={{ fontSize: 'clamp(24px, 4vw, 40px)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 'var(--space-3)' }}>
                Build your first course today
              </h2>
              <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', marginBottom: 'var(--space-6)', maxWidth: 460, margin: '0 auto var(--space-6)' }}>
                Start free. Turn an idea into a launch-ready course — content, sales page, and marketing.
              </p>
              <button onClick={goStart} className="cf-btn cf-btn-primary" style={{
                border: 'none', color: '#fff', borderRadius: 'var(--radius-md)', padding: '16px 36px',
                fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
              }}>{ctaLabel} →</button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--surface-border)', padding: 'var(--space-6)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <BrandMark size={24} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' }}>CourseForge AI</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>AI course creation — from idea to live in minutes.</span>
        </div>
      </footer>
    </div>
  )
}
