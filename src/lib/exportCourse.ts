/**
 * exportCourse.ts — assembles the owner's course into a single self-contained,
 * printable HTML file for student delivery. Uses only data the owner can already
 * read (RLS-covered) — no public exposure, no server changes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/* Minimal, safe markdown → HTML (headings, bold, italics, lists, paragraphs). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function mdToHtml(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  const inline = (t: string) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^#{1,3}\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      const level = line.match(/^#+/)![0].length
      out.push(`<h${level + 1}>${inline(line.replace(/^#+\s/, ''))}</h${level + 1}>`)
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`)
    } else if (line === '') {
      if (inList) { out.push('</ul>'); inList = false }
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}

interface Written { body_markdown?: string; key_takeaways?: string[] }

export async function exportCourseHtml(courseId: string, supabase: SupabaseClient): Promise<void> {
  const [{ data: course }, { data: bp }, { data: modules }, { data: lessons }] = await Promise.all([
    supabase.from('courses').select('title, target_niche').eq('id', courseId).single(),
    supabase.from('course_blueprints').select('core_framework').eq('course_id', courseId).eq('is_active', true).maybeSingle(),
    supabase.from('modules').select('id,title,description,sort_order').eq('course_id', courseId).is('deleted_at', null).order('sort_order'),
    supabase.from('lessons').select('id,module_id,title,sort_order,context_hook').eq('course_id', courseId).is('deleted_at', null).order('sort_order'),
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
  const title = (fw.course_title as string) || course?.title || 'Course'
  const subtitle = (fw.subtitle as string) || ''
  const objectives = (fw.learning_objectives as string[]) ?? []

  const modHtml = (modules ?? []).map((m, mi) => {
    const ls = (lessons ?? []).filter(l => l.module_id === m.id)
    const lessonHtml = ls.map(les => {
      const c = content[les.id]
      const body = c?.body_markdown ? mdToHtml(c.body_markdown) : '<p><em>Content coming soon.</em></p>'
      const takeaways = Array.isArray(c?.key_takeaways) && c!.key_takeaways!.length
        ? `<div class="takeaways"><strong>Key takeaways</strong><ul>${c!.key_takeaways!.map(k => `<li>${esc(k)}</li>`).join('')}</ul></div>` : ''
      const hook = les.context_hook ? `<p class="hook">${esc(les.context_hook)}</p>` : ''
      return `<section class="lesson"><h3>${esc(les.title)}</h3>${hook}${body}${takeaways}</section>`
    }).join('\n')
    return `<div class="module"><h2><span class="num">${String(mi + 1).padStart(2, '0')}</span> ${esc(m.title)}</h2>${m.description ? `<p class="mdesc">${esc(m.description)}</p>` : ''}${lessonHtml}</div>`
  }).join('\n')

  const objHtml = objectives.length
    ? `<div class="objectives"><h2>What you'll learn</h2><ul>${objectives.map(o => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  :root { --ink:#1a1a2e; --muted:#555; --brand:#4f46e5; --line:#e5e7eb; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: var(--ink); max-width: 780px; margin: 0 auto; padding: 48px 24px 96px; line-height: 1.65; }
  header.cover { text-align: center; padding-bottom: 32px; border-bottom: 1px solid var(--line); margin-bottom: 32px; }
  header.cover h1 { font-size: 2.2rem; margin: 0 0 8px; letter-spacing: -0.02em; }
  header.cover p { color: var(--muted); font-size: 1.1rem; margin: 0; }
  .objectives { background: #f6f7fb; border: 1px solid var(--line); border-radius: 12px; padding: 20px 24px; margin-bottom: 40px; }
  .objectives h2 { margin: 0 0 8px; font-size: 1.1rem; }
  .module { margin-bottom: 48px; }
  .module > h2 { font-size: 1.5rem; border-bottom: 2px solid var(--brand); padding-bottom: 8px; }
  .module .num { color: var(--brand); font-family: ui-monospace, monospace; }
  .mdesc { color: var(--muted); margin-top: -4px; }
  .lesson { margin: 28px 0; padding-left: 16px; border-left: 3px solid var(--line); }
  .lesson h3 { font-size: 1.15rem; margin: 0 0 8px; }
  .lesson .hook { font-style: italic; color: var(--muted); }
  .takeaways { background: #f6f7fb; border-radius: 10px; padding: 12px 18px; margin-top: 12px; }
  code { background: #eef; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
  footer { text-align: center; color: #999; font-size: 0.85rem; margin-top: 64px; }
  @media print { body { padding: 0; } .lesson { break-inside: avoid; } }
</style></head><body>
<header class="cover"><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</header>
${objHtml}
${modHtml}
<footer>Created with CourseForge AI</footer>
</body></html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 60) || 'course'}.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
