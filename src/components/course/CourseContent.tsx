'use client'
/**
 * CourseContent — the actual curriculum view for a course.
 *
 * Read-only. Shows what the agents produced: modules → lessons → C.O.R.E.
 * fields + generated written content. No agents/workflows/policies touched —
 * this only reads existing rows (modules, lessons, digital_assets).
 */
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'

interface ModuleRow {
  id: string
  title: string
  description: string | null
  sort_order: number
  is_mvc: boolean
}
interface LessonRow {
  id: string
  module_id: string
  title: string
  sort_order: number
  estimated_minutes: number | null
  context_hook: string | null
  observation_concept: string | null
  reflection_exercise: string | null
}
interface WrittenContent {
  body_markdown?: string
  key_takeaways?: string[]
  call_to_action?: string
  word_count?: number
  reading_time_minutes?: number
}

function fmtMins(total: number): string {
  if (total <= 0) return '0 min'
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${m}m` : `${m} min`
}

// Inline parser: **bold** → <strong>, rest as text. Safe (no HTML injection).
function renderInline(s: string, keyBase: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) =>
    /^\*\*[^*]+\*\*$/.test(p)
      ? <strong key={`${keyBase}-${i}`} style={{ color: 'var(--text-primary)' }}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={`${keyBase}-${i}`}>{p}</React.Fragment>
  )
}

// Lightweight markdown → React (headings, bullets, bold, paragraphs). No deps,
// no dangerouslySetInnerHTML — builds plain elements from parsed lines.
function MarkdownLite({ text }: { text: string }) {
  const lines = text.split(/\r?\n/)
  const blocks: React.ReactNode[] = []
  let list: string[] = []
  const flush = (k: string) => {
    if (list.length) {
      blocks.push(
        <ul key={`ul-${k}`} style={{ margin: '0 0 8px', paddingLeft: 18, lineHeight: 1.6 }}>
          {list.map((li, i) => <li key={i}>{renderInline(li, `li-${k}-${i}`)}</li>)}
        </ul>
      )
      list = []
    }
  }
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (/^#{1,3}\s+/.test(line)) {
      flush(`${idx}`)
      const lvl = line.startsWith('### ') ? 3 : line.startsWith('## ') ? 2 : 1
      blocks.push(
        <div key={`h-${idx}`} style={{
          fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)',
          fontSize: lvl === 1 ? 'var(--text-base)' : 'var(--text-sm)', margin: '10px 0 4px',
        }}>
          {renderInline(line.replace(/^#{1,3}\s+/, ''), `h-${idx}`)}
        </div>
      )
    } else if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''))
    } else if (line.trim() === '') {
      flush(`${idx}`)
    } else {
      flush(`${idx}`)
      blocks.push(<p key={`p-${idx}`} style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{renderInline(line, `p-${idx}`)}</p>)
    }
  })
  flush('end')
  return <>{blocks}</>
}

const chevron = (open: boolean) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease', flexShrink: 0 }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

function CoreField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontWeight: 'var(--weight-semibold)' }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{value}</span>
    </div>
  )
}

export function CourseContent({ courseId }: { courseId: string }) {
  const supabase = createBrowserClient()
  const [openModules, setOpenModules] = useState<Set<string>>(new Set())
  const [openLessons, setOpenLessons] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['course-content', courseId],
    queryFn: async () => {
      const [{ data: modules }, { data: lessons }] = await Promise.all([
        supabase.from('modules')
          .select('id,title,description,sort_order,is_mvc')
          .eq('course_id', courseId).is('deleted_at', null).order('sort_order'),
        supabase.from('lessons')
          .select('id,module_id,title,sort_order,estimated_minutes,context_hook,observation_concept,reflection_exercise')
          .eq('course_id', courseId).is('deleted_at', null).order('sort_order'),
      ])
      const lessonIds = (lessons ?? []).map(l => l.id)
      let contentByLesson: Record<string, WrittenContent> = {}
      if (lessonIds.length) {
        const { data: assets } = await supabase.from('digital_assets')
          .select('source_id,content_json')
          .in('source_id', lessonIds).eq('asset_type', 'lesson_script').eq('is_active', true)
        for (const a of assets ?? []) {
          contentByLesson[a.source_id as string] = (a.content_json ?? {}) as WrittenContent
        }
      }
      return {
        modules: (modules ?? []) as ModuleRow[],
        lessons: (lessons ?? []) as LessonRow[],
        contentByLesson,
      }
    },
  })

  if (isLoading) {
    return (
      <Card padding="lg">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-tertiary)' }}>
          <Spinner size={16} /> Loading course content…
        </div>
      </Card>
    )
  }

  const modules = data?.modules ?? []
  const lessons = data?.lessons ?? []
  const contentByLesson = data?.contentByLesson ?? {}

  if (!modules.length) {
    return (
      <Card padding="lg">
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 4 }}>
          Course Content
        </h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
          No modules yet. Run the Architecture Agent to design the curriculum.
        </p>
      </Card>
    )
  }

  const totalMins = lessons.reduce((s, l) => s + (l.estimated_minutes ?? 0), 0)

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  return (
    <Card padding="lg">
      {/* Header + summary */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>
          Course Content
        </h2>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
          {modules.length} modules · {lessons.length} lessons · {fmtMins(totalMins)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {modules.map((mod, mi) => {
          const modLessons = lessons.filter(l => l.module_id === mod.id)
          const modMins = modLessons.reduce((s, l) => s + (l.estimated_minutes ?? 0), 0)
          const open = openModules.has(mod.id)
          return (
            <div key={mod.id} style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {/* Module header */}
              <button
                onClick={() => toggle(openModules, mod.id, setOpenModules)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-4)', background: 'var(--surface-sunken)', border: 'none',
                  cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
                }}
              >
                {chevron(open)}
                <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  M{mi}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
                  {mod.title}
                </span>
                {mod.is_mvc && <Badge variant="brand">MVC</Badge>}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  {modLessons.length} lessons · {fmtMins(modMins)}
                </span>
              </button>

              {/* Module body */}
              {open && (
                <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {mod.description && (
                    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)', lineHeight: 1.5 }}>
                      {mod.description}
                    </p>
                  )}
                  {modLessons.map((les, li) => {
                    const lopen = openLessons.has(les.id)
                    const content = contentByLesson[les.id]
                    const hasContent = !!content?.body_markdown
                    return (
                      <div key={les.id} style={{ border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)' }}>
                        <button
                          onClick={() => toggle(openLessons, les.id, setOpenLessons)}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                            padding: 'var(--space-3)', background: 'transparent', border: 'none',
                            cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
                          }}
                        >
                          {chevron(lopen)}
                          <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                            {mi}.{li + 1}
                          </span>
                          <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)' }}>{les.title}</span>
                          {!hasContent && <Badge variant="warning">No content yet</Badge>}
                          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                            {les.estimated_minutes ?? 0}m
                          </span>
                        </button>

                        {lopen && (
                          <div style={{ padding: '0 var(--space-4) var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                            {/* C.O.R.E. fields */}
                            <CoreField label="Hook (Context)" value={les.context_hook} />
                            <CoreField label="Concept (Observation)" value={les.observation_concept} />
                            <CoreField label="Exercise (Reflection)" value={les.reflection_exercise} />

                            {/* Generated written content */}
                            {hasContent ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontWeight: 'var(--weight-semibold)' }}>
                                  Lesson content{content?.reading_time_minutes ? ` · ${content.reading_time_minutes} min read` : ''}
                                </span>
                                <div style={{
                                  fontSize: 'var(--text-sm)', color: 'var(--text-secondary)',
                                  background: 'var(--surface-sunken)',
                                  borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)', maxHeight: 360, overflowY: 'auto',
                                }}>
                                  <MarkdownLite text={content!.body_markdown!} />
                                </div>
                                {Array.isArray(content?.key_takeaways) && content!.key_takeaways!.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', fontWeight: 'var(--weight-semibold)' }}>
                                      Key takeaways
                                    </span>
                                    <ul style={{ margin: 0, paddingLeft: 'var(--space-5)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                                      {content!.key_takeaways!.map((k, i) => <li key={i}>{k}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {content?.call_to_action && (
                                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-indigo-400)', fontStyle: 'italic' }}>
                                    → {content.call_to_action}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                Written content not generated for this lesson yet.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
