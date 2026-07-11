'use client'
/**
 * CoursePreview — the course as a student would see it. Read-only, built from
 * existing data (blueprint + modules + lessons + latest written lesson content).
 * Used in the course "Course" tab and the standalone /preview page.
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { MarkdownLite } from './markdown'
import { useUpdateLesson } from '@/hooks/useUpdateLesson'

interface CoursePreviewProps { courseId: string; editable?: boolean }

interface Mod { id: string; title: string; description: string | null; sort_order: number; is_mvc: boolean }
interface Les { id: string; module_id: string; title: string; sort_order: number; estimated_minutes: number | null; context_hook: string | null; observation_concept: string | null; reflection_exercise: string | null }
interface Written { body_markdown?: string; key_takeaways?: string[]; call_to_action?: string; reading_time_minutes?: number }

function fmtHours(total: number): string {
  if (!total) return '—'
  const h = Math.floor(total)
  const m = Math.round((total - h) * 60)
  return h > 0 ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}

const editLabel: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const editInput: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none', width: '100%', fontFamily: 'var(--font-sans)' }

export function CoursePreview({ courseId, editable = true }: CoursePreviewProps) {
  const supabase = createBrowserClient()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<{ title: string; body: string; takeaways: string }>({ title: '', body: '', takeaways: '' })
  const { mutate: saveLesson, isPending: saving, isError: saveError } = useUpdateLesson(courseId)

  const startEdit = (lessonId: string, title: string, c?: Written) => {
    setForm({ title, body: c?.body_markdown ?? '', takeaways: (c?.key_takeaways ?? []).join('\n') })
    setEditId(lessonId)
  }
  const doSave = (lessonId: string) => {
    saveLesson({
      lessonId,
      title: form.title.trim() || undefined,
      bodyMarkdown: form.body,
      keyTakeaways: form.takeaways.split('\n').map(s => s.trim()).filter(Boolean),
    }, { onSuccess: () => setEditId(null) })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['course-preview', courseId],
    queryFn: async () => {
      const [{ data: course }, { data: bp }, { data: modules }, { data: lessons }] = await Promise.all([
        supabase.from('courses').select('title, target_niche').eq('id', courseId).single(),
        supabase.from('course_blueprints').select('core_framework, total_lessons, estimated_hours').eq('course_id', courseId).eq('is_active', true).maybeSingle(),
        supabase.from('modules').select('id,title,description,sort_order,is_mvc').eq('course_id', courseId).is('deleted_at', null).order('sort_order'),
        supabase.from('lessons').select('id,module_id,title,sort_order,estimated_minutes,context_hook,observation_concept,reflection_exercise').eq('course_id', courseId).is('deleted_at', null).order('sort_order'),
      ])
      const lessonIds = (lessons ?? []).map(l => l.id)
      const content: Record<string, Written> = {}
      if (lessonIds.length) {
        const { data: assets } = await supabase
          .from('digital_assets').select('source_id, content_json, created_at')
          .in('source_id', lessonIds).eq('asset_type', 'lesson_script')
          .order('created_at', { ascending: false })
        for (const a of assets ?? []) {
          const sid = a.source_id as string
          if (!(sid in content)) content[sid] = (a.content_json ?? {}) as Written
        }
      }
      const fw = (bp?.core_framework as Record<string, unknown>) ?? {}
      return {
        title: (fw.course_title as string) || course?.title || 'Untitled course',
        subtitle: (fw.subtitle as string) || '',
        tagline: (fw.tagline as string) || '',
        objectives: (fw.learning_objectives as string[]) ?? [],
        hours: (bp?.estimated_hours as number) ?? (fw.total_hours as number) ?? 0,
        modules: (modules ?? []) as Mod[],
        lessons: (lessons ?? []) as Les[],
        content,
      }
    },
  })

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner size={24} /></div>
  if (!data || !data.modules.length) {
    return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>No course content yet — run the Architecture and Content agents first.</div>
  }

  const { title, subtitle, tagline, objectives, hours, modules, lessons, content } = data
  const totalMin = lessons.reduce((s, l) => s + (l.estimated_minutes ?? 0), 0)
  const toggle = (id: string) => { const n = new Set(open); n.has(id) ? n.delete(id) : n.add(id); setOpen(n) }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ position: 'relative', padding: 'var(--space-7) 0 var(--space-5)', borderBottom: '1px solid var(--surface-border)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', top: -40, left: -80, width: 340, height: 200, pointerEvents: 'none', background: 'radial-gradient(circle at 30% 40%, rgba(99,102,241,0.14), transparent 68%)' }} />
        {tagline && <p style={{ position: 'relative', fontSize: 'var(--text-sm)', color: 'var(--color-indigo-400)', fontWeight: 'var(--weight-semibold)', marginBottom: 8 }}>{tagline}</p>}
        <h1 style={{ position: 'relative', fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 10, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>{subtitle}</p>}
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
          <span>{modules.length} modules</span><span>·</span>
          <span>{lessons.length} lessons</span><span>·</span>
          <span>~{hours ? fmtHours(hours) : `${Math.round(totalMin / 60 * 10) / 10}h`} of content</span>
        </div>
      </div>

      {/* What you'll learn */}
      {objectives.length > 0 && (
        <div style={{ padding: 'var(--space-5) 0', borderBottom: '1px solid var(--surface-border)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>What you&rsquo;ll learn</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '10px 24px' }}>
            {objectives.map((o, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-green-400)" strokeWidth="3" style={{ flexShrink: 0, marginTop: 3 }}><polyline points="20 6 9 17 4 12" /></svg>
                <span>{o}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Curriculum */}
      <div style={{ padding: 'var(--space-5) 0' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Curriculum</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {modules.map((mod, mi) => {
            const ml = lessons.filter(l => l.module_id === mod.id)
            return (
              <section key={mod.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 'var(--space-2)' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{String(mi + 1).padStart(2, '0')}</span>
                  <h3 style={{ flex: 1, fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>{mod.title}</h3>
                  {mod.is_mvc && <Badge variant="brand">Start here</Badge>}
                </div>
                {mod.description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>{mod.description}</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ml.map((les, li) => {
                    const c = content[les.id]
                    const isOpen = open.has(les.id)
                    return (
                      <div key={les.id} style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        <button onClick={() => toggle(les.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--space-3) var(--space-4)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0, color: 'var(--text-tertiary)' }}><polyline points="9 18 15 12 9 6" /></svg>
                          <span style={{ flex: 1, fontSize: 'var(--text-sm)' }}>{les.title}</span>
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{les.estimated_minutes ?? 0} min</span>
                        </button>
                        {isOpen && editId === les.id ? (
                          <div style={{ padding: '0 var(--space-5) var(--space-5) var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            <label style={editLabel}>Lesson title</label>
                            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={editInput} />
                            <label style={editLabel}>Lesson content (markdown)</label>
                            <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={12} style={{ ...editInput, resize: 'vertical', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }} />
                            <label style={editLabel}>Key takeaways (one per line)</label>
                            <textarea value={form.takeaways} onChange={e => setForm({ ...form, takeaways: e.target.value })} rows={4} style={{ ...editInput, resize: 'vertical' }} />
                            {saveError && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red-400)' }}>Couldn&rsquo;t save — please try again.</p>}
                            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                              <Button variant="primary" size="sm" loading={saving} onClick={() => doSave(les.id)}>Save changes</Button>
                              <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : isOpen && (
                          <div style={{ padding: '0 var(--space-5) var(--space-5) var(--space-6)' }}>
                            {les.context_hook && <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.6, margin: '4px 0 12px' }}>{les.context_hook}</p>}
                            {c?.body_markdown
                              ? <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}><MarkdownLite text={c.body_markdown} /></div>
                              : <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Lesson content is being prepared.</p>}
                            {Array.isArray(c?.key_takeaways) && c!.key_takeaways!.length > 0 && (
                              <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)' }}>
                                <p style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 6 }}>Key takeaways</p>
                                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                                  {c!.key_takeaways!.map((k, i) => <li key={i}>{k}</li>)}
                                </ul>
                              </div>
                            )}
                            {editable && (
                              <button onClick={() => startEdit(les.id, les.title, c)} className="cf-navlink" style={{ marginTop: 'var(--space-3)', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
                                Edit lesson
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
