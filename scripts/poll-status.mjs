/**
 * poll-status.mjs — poll course status until it changes from a given value.
 * Usage: node scripts/poll-status.mjs <fromStatus> [courseId]
 * Prints "RESULT: <newStatus>" and, if failed, the latest error.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(resolve(__dir, '../.env.local'), 'utf8')
const env    = Object.fromEntries(
  envRaw.split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const FROM      = process.argv[2]
const COURSE_ID = process.argv[3] ?? '91b1abe9-255b-452e-b4b3-1dd14eec28cd'
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const sleep = ms => new Promise(r => setTimeout(r, ms))

for (let i = 0; i < 40; i++) {
  const { data } = await sb.from('courses').select('status').eq('id', COURSE_ID).single()
  if (data.status !== FROM) {
    console.log('RESULT:', data.status)
    if (data.status === 'failed') {
      const { data: logs } = await sb.from('agent_logs')
        .select('error_message').eq('course_id', COURSE_ID).eq('event_type', 'error')
        .order('created_at', { ascending: false }).limit(1)
      console.log('ERROR:', (logs?.[0]?.error_message || '').slice(0, 600))
    }
    break
  }
  await sleep(3000)
}
process.exit(0)
