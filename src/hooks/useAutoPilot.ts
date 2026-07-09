'use client'
/**
 * useAutoPilot — client-side orchestrator that automates the manual
 * Run → Approve loop all the way to `live`. It calls the EXACT same edge
 * functions the user triggers by hand (execute-agent-workflow +
 * perform-approval-action) — no agent, DB, or state-machine changes.
 *
 * Safety: stops on any error, has a hard step cap, and can be cancelled.
 */
import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import { canTriggerAgent, isHumanReview, isTerminal, agentLabel } from '@/lib/course-status'

export interface AutoPilotState {
  running: boolean
  step: string
  error: string | null
  done: boolean
}

const MAX_STEPS = 24 // ~6 runs + 6 approves, with headroom

export function useAutoPilot(courseId: string, niche: string) {
  const supabase    = createBrowserClient()
  const queryClient = useQueryClient()
  const stopRef     = useRef(false)
  const [state, setState] = useState<AutoPilotState>({ running: false, step: '', error: null, done: false })

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['course', courseId] })
    queryClient.invalidateQueries({ queryKey: ['agent_logs', courseId] })
    queryClient.invalidateQueries({ queryKey: ['pending-approvals', courseId] })
  }, [queryClient, courseId])

  const fetchStatus = useCallback(async (): Promise<string> => {
    const { data, error } = await supabase.from('courses').select('status').eq('id', courseId).single()
    if (error) throw new Error(error.message)
    return data.status as string
  }, [supabase, courseId])

  const runAgent = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error('Your session expired — please sign in again.')
    const { data, error } = await supabase.functions.invoke('execute-agent-workflow', {
      body: { courseId, userId: session.user.id, niche },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.message ?? data.error)
  }, [supabase, courseId, niche])

  const approve = useCallback(async () => {
    const { data: approvals, error: apErr } = await supabase.rpc('get_pending_approvals', { p_course_id: courseId })
    if (apErr) throw new Error(apErr.message)
    const row = (approvals ?? [])[0] as Record<string, unknown> | undefined
    const approvalId = (row?.approval_id ?? row?.id) as string | undefined
    if (!approvalId) throw new Error('No pending approval was found to approve.')
    const { data, error } = await supabase.functions.invoke('perform-approval-action', {
      body: { approvalId, action: 'approve' },
    })
    if (error) throw new Error(error.message)
    if (data?.error) throw new Error(data.message ?? data.error)
  }, [supabase, courseId])

  const stop = useCallback(() => { stopRef.current = true }, [])

  const start = useCallback(async () => {
    stopRef.current = false
    setState({ running: true, step: 'Starting auto-pilot…', error: null, done: false })
    try {
      for (let i = 0; i < MAX_STEPS; i++) {
        if (stopRef.current) { setState(s => ({ ...s, running: false, step: 'Auto-pilot stopped.' })); return }

        const status = await fetchStatus()
        refresh()

        if (status === 'live' || status === 'live_analytics') {
          setState({ running: false, step: 'Your course is live 🎉', error: null, done: true })
          return
        }
        if (isTerminal(status)) {
          setState({ running: false, step: `Stopped — course is "${status}".`, error: null, done: false })
          return
        }
        if (canTriggerAgent(status)) {
          setState(s => ({ ...s, step: `Running ${agentLabel(status)}… (this can take up to a minute)` }))
          await runAgent()
        } else if (isHumanReview(status)) {
          setState(s => ({ ...s, step: `Approving ${status.replace(/_/g, ' ')}…` }))
          await approve()
        } else {
          setState({ running: false, step: `Paused at "${status}" — needs manual attention.`, error: null, done: false })
          return
        }
        refresh()
      }
      setState(s => ({ ...s, running: false, step: 'Reached the step limit — open Build to continue manually.' }))
    } catch (e) {
      refresh()
      setState({ running: false, step: '', error: e instanceof Error ? e.message : 'Auto-pilot failed.', done: false })
    }
  }, [fetchStatus, runAgent, approve, refresh])

  return { state, start, stop }
}
