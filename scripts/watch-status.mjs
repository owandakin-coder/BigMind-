/**
 * watch-status.mjs — poll course status every 5s and print changes.
 * Usage: node scripts/watch-status.mjs [courseId]
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(resolve(__dir, '../.env.local'), 'utf8')
const env    = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const COURSE_ID = process.argv[2] ?? '91b1abe9-255b-452e-b4b3-1dd14eec28cd'
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

let lastStatus = null

async function poll() {
  const { data: course } = await sb
    .from('courses')
    .select('status, updated_at')
    .eq('id', COURSE_ID)
    .single()
  if (!course) return

  if (course.status !== lastStatus) {
    const ts = new Date().toLocaleTimeString()
    console.log(`[${ts}] status: ${lastStatus ?? '?'} → ${course.status}`)
    lastStatus = course.status

    if (['architecture_review', 'failed', 'architecture_rejected'].includes(course.status)) {
      // Also fetch latest agent log
      const { data: log } = await sb
        .from('agent_logs')
        .select('event_type, error_code, error_message, to_status, created_at')
        .eq('course_id', COURSE_ID)
        .order('created_at', { ascending: false })
        .limit(3)
      if (log) {
        console.log('\nLatest agent logs:')
        log.forEach(l => console.log(`  [${l.event_type}] to:${l.to_status ?? '-'} err:${l.error_code ?? '-'} ${l.error_message ?? ''}`))
      }
      if (course.status !== 'architecture_design') {
        console.log('\nDone. Exiting.\n')
        process.exit(0)
      }
    }
  }
}

console.log(`Watching course ${COURSE_ID} — press Ctrl+C to stop\n`)
await poll()
setInterval(poll, 4000)
