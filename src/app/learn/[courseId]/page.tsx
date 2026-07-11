'use client'
export const dynamic = 'force-dynamic'
/**
 * /learn/[courseId] — PUBLIC student course page. No auth required.
 * Reads a curated, read-only view via the get_public_course RPC (live courses
 * only). Safe to share with students.
 */
import React, { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import { BrandMark } from '@/components/ui/TopNav'
import { MarkdownLite } from '@/components/preview/markdown'

interface PublicLesson { title: string; hook: string | null; body_markdown: string | null; key_takeaways: string[] | null }
interface PublicModule { title: string; description: string | null; lessons: PublicLesson[] }
interface PublicCourse { title: string; subtitle: string | null; tagline: string | null; objectives: string[]; modules: PublicModule[] }

export default function LearnPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const [open, setOpen] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['public-course', courseId],
    queryFn: async () => {
      const supabase = createBrowserClient()
      const { data, error } = await supabase.rpc('get_public_course', { p_course_id: courseId })
      if (error) throw error
      return (data ?? null) as PublicCourse | null
    },
  })

  const toggle = (id: string) => { const n = new Set(open); n.has(id) ? n.delete(id) : n.add(id); setOpen(n) }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-base)' }}>
      <header style={{ height: 56, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-6)', borderBottom: '1px solid var(--surface-border)', background: 'rgba(10,10,15,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <BrandMark size={24} />
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-secondary)' }}>CourseForge<span className="cf-gradient-text"> AI</span></span>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: 'var(--space-6)' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Spinner size={28} /></div>
        ) : !data ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 40, marginBottom: 'var(--space-3)' }}>🔍</div>
            <h1 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Course not available</h1>
            <p>This course isn&rsquo;t published yet, or the link is incorrect.</p>
          </div>
        ) : (
          <>
            {/* Hero */}
            <div style={{ textAlign: 'center', padding: 'var(--space-7) 0 var(--space-6)', borderBottom: '1px solid var(--surface-border)' }}>
              {data.tagline && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-indigo-400)', fontWeight: 'var(--weight-semibold)', marginBottom: 8 }}>{data.tagline}</p>}
              <h1 style={{ fontSize: 'clamp(28px,5vw,40px)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', lineHeight: 1.15, letterSpacing: '-0.02em' }}>{data.title}</h1>
              {data.subtitle && <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 620, margin: 'var(--space-3) auto 0' }}>{data.subtitle}</p>}
            </div>

            {/* Objectives */}
            {data.objectives?.length > 0 && (
              <div style={{ padding: 'var(--space-6) 0', borderBottom: '1px solid var(--surface-border)' }}>
                <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>What you&rsquo;ll learn</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '10px 24px' }}>
                  {data.objectives.map((o, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-green-400)" strokeWidth="3" style={{ flexShrink: 0, marginTop: 3 }}><polyline points="20 6 9 17 4 12" /></svg>
                      <span>{o}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Curriculum */}
            <div style={{ padding: 'var(--space-6) 0' }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Course content</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {data.modules.map((mod, mi) => (
                  <section key={mi}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 'var(--space-2)' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{String(mi + 1).padStart(2, '0')}</span>
                      <h3 style={{ flex: 1, fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>{mod.title}</h3>
                    </div>
                    {mod.description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>{mod.description}</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mod.lessons.map((les, li) => {
                        const id = `${mi}-${li}`
                        const isOpen = open.has(id)
                        return (
                          <div key={id} style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                            <button onClick={() => toggle(id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--space-3) var(--space-4)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0, color: 'var(--text-tertiary)' }}><polyline points="9 18 15 12 9 6" /></svg>
                              <span style={{ flex: 1, fontSize: 'var(--text-sm)' }}>{les.title}</span>
                            </button>
                            {isOpen && (
                              <div style={{ padding: '0 var(--space-5) var(--space-5) var(--space-6)' }}>
                                {les.hook && <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: '4px 0 12px' }}>{les.hook}</p>}
                                {les.body_markdown
                                  ? <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}><MarkdownLite text={les.body_markdown} /></div>
                                  : <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Content coming soon.</p>}
                                {Array.isArray(les.key_takeaways) && les.key_takeaways.length > 0 && (
                                  <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}>
                                    <p style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 6 }}>Key takeaways</p>
                                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                                      {les.key_takeaways.map((k, i) => <li key={i}>{k}</li>)}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
            <footer style={{ textAlign: 'center', padding: 'var(--space-6) 0', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', borderTop: '1px solid var(--surface-border)' }}>
              Created with CourseForge AI
            </footer>
          </>
        )}
      </main>
    </div>
  )
}
