'use client'
/**
 * MarketingHub — read-only viewer for the generated marketing assets, grouped
 * by channel, each with a copy-to-clipboard button. From existing data only.
 */
import React, { useState } from 'react'
import { useCourseAssets } from '@/hooks/useCourseAssets'
import { Spinner } from '@/components/ui/Spinner'

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* ignore */ }
  }
  return (
    <button onClick={copy} aria-label="Copy to clipboard" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
      fontSize: 'var(--text-xs)', color: done ? 'var(--color-green-400)' : 'var(--text-secondary)',
      background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)',
      padding: '4px 10px', cursor: 'pointer',
    }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        {done ? <polyline points="20 6 9 17 4 12" /> : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>}
      </svg>
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null
  return (
    <div style={{ marginBottom: 'var(--space-6)' }}>
      <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>{title} <span style={{ color: 'var(--text-tertiary)', fontWeight: 'var(--weight-regular)' }}>· {count}</span></h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>{children}</div>
    </div>
  )
}

const card: React.CSSProperties = { border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }
const head: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }
const tag = (t: string) => <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-indigo-400)', textTransform: 'capitalize' }}>{t}</span>
const body: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }

export function MarketingHub({ courseId }: { courseId: string }) {
  const { data, isLoading } = useCourseAssets(courseId)
  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner size={24} /></div>
  const m = data?.marketing
  if (!data?.hasMarketing || !m) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>No marketing assets yet — run the Marketing agent.</div>

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Email */}
      <Section title="Email sequence" count={(m.newsletter ? 1 : 0) + m.emailSequence.length}>
        {m.newsletter && (
          <div style={card}>
            <div style={head}>{tag('newsletter')}<CopyButton text={`Subject: ${m.newsletter.subject_line ?? ''}\n\n${m.newsletter.body ?? ''}`} /></div>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{m.newsletter.subject_line}</p>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 6 }}>{m.newsletter.preview_text}</p>
            <p style={body}>{m.newsletter.body}</p>
          </div>
        )}
        {m.emailSequence.map((e, i) => (
          <div key={i} style={card}>
            <div style={head}>{tag(`day ${e.day ?? i}`)}<CopyButton text={`Subject: ${e.subject ?? ''}\n\n${e.body ?? ''}\n\n${e.cta ?? ''}`} /></div>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{e.subject}</p>
            <p style={{ ...body, marginTop: 6 }}>{e.body}</p>
            {e.cta && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-indigo-400)', marginTop: 6 }}>{e.cta}</p>}
          </div>
        ))}
      </Section>

      {/* Social */}
      <Section title="Social posts" count={m.twitterThreads.length + (m.linkedinCarousel ? 1 : 0)}>
        {m.twitterThreads.map((t, i) => {
          const full = [t.hook, ...(t.tweets ?? []), t.cta].filter(Boolean).join('\n\n')
          return (
            <div key={i} style={card}>
              <div style={head}>{tag('twitter thread')}<CopyButton text={full} /></div>
              {t.hook && <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 8 }}>{t.hook}</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(t.tweets ?? []).map((tw, j) => <p key={j} style={{ ...body, paddingLeft: 12, borderLeft: '2px solid var(--surface-border)' }}>{tw}</p>)}
              </div>
              {t.cta && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-indigo-400)', marginTop: 8 }}>{t.cta}</p>}
            </div>
          )
        })}
        {m.linkedinCarousel && (
          <div style={card}>
            <div style={head}>{tag('linkedin carousel')}<CopyButton text={[m.linkedinCarousel.title, ...(m.linkedinCarousel.slides ?? []).map(s => `${s.headline ?? ''}\n${s.body ?? ''}`)].filter(Boolean).join('\n\n')} /></div>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 8 }}>{m.linkedinCarousel.title}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(m.linkedinCarousel.slides ?? []).map((s, j) => (
                <div key={j} style={{ paddingLeft: 12, borderLeft: '2px solid var(--surface-border)' }}>
                  <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--text-primary)' }}>{s.headline}</p>
                  <p style={body}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Ads */}
      <Section title="Ad copy" count={m.adCopy.length}>
        {m.adCopy.map((a, i) => (
          <div key={i} style={card}>
            <div style={head}>{tag(a.platform ?? 'ad')}<CopyButton text={`${a.headline ?? ''}\n${a.description ?? ''}\n[${a.cta_button ?? ''}]`} /></div>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>{a.headline}</p>
            <p style={{ ...body, marginTop: 4 }}>{a.description}</p>
            {a.cta_button && <span style={{ display: 'inline-block', marginTop: 8, fontSize: 'var(--text-xs)', color: '#fff', background: 'var(--color-indigo-400)', padding: '3px 10px', borderRadius: 'var(--radius-sm)' }}>{a.cta_button}</span>}
          </div>
        ))}
      </Section>

      {/* Video */}
      <Section title="Short-form video scripts" count={m.videoScripts.length}>
        {m.videoScripts.map((v, i) => (
          <div key={i} style={card}>
            <div style={head}>{tag(`${v.platform ?? 'video'}${v.duration_s ? ` · ${v.duration_s}s` : ''}`)}<CopyButton text={`HOOK: ${v.hook ?? ''}\n\n${v.body ?? ''}\n\nCTA: ${v.cta ?? ''}`} /></div>
            {v.hook && <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 6 }}>{v.hook}</p>}
            <p style={body}>{v.body}</p>
            {v.cta && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-indigo-400)', marginTop: 6 }}>{v.cta}</p>}
          </div>
        ))}
      </Section>

      {/* Calendar */}
      <Section title="Content calendar" count={m.contentCalendar.length ? 1 : 0}>
        <div style={card}>
          <div style={head}>{tag(`${m.contentCalendar.length}-day plan`)}<CopyButton text={m.contentCalendar.map(c => `Day ${c.day}: [${c.platform}] ${c.content_type} — ${c.topic}`).join('\n')} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {m.contentCalendar.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', minWidth: 46 }}>Day {c.day}</span>
                <span style={{ color: 'var(--color-indigo-400)', minWidth: 70, textTransform: 'capitalize' }}>{c.platform}</span>
                <span>{c.topic}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}
