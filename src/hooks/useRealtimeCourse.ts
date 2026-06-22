// useRealtimeCourse.ts — Subscribes to all live data for a single course
'use client'
import { useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Course, AgentLog, Approval, AnalyticsTask } from '@/types/database.types'

export function useRealtimeCourse(courseId: string) {
  const queryClient = useQueryClient()
  const supabase    = createClient()

  const invalidate = useCallback((keys: string[][]) => {
    keys.forEach(key => queryClient.invalidateQueries({ queryKey: key }))
  }, [queryClient])

  useEffect(() => {
    if (!courseId) return

    // ── 1. Course status changes (drives DAG) ─────────────────────────────
    const courseChannel = supabase
      .channel(`course:${courseId}:status`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'courses',
        filter: `id=eq.${courseId}`,
      }, (payload) => {
        const updated = payload.new as Course
        // Optimistic cache update — no roundtrip needed for status
        queryClient.setQueryData<Course>(['course', courseId], old =>
          old ? { ...old, ...updated } : updated
        )
        // Invalidate dashboard composite query
        invalidate([['dashboard', courseId]])
      })
      .subscribe()

    // ── 2. Agent log stream (Activity Feed) ───────────────────────────────
    const logsChannel = supabase
      .channel(`agent_logs:${courseId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'agent_logs',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const newLog = payload.new as AgentLog
        queryClient.setQueryData<AgentLog[]>(['agent_logs', courseId], old => {
          const list = [newLog, ...(old ?? [])]
          return list.slice(0, 100)  // cap at 100 in memory
        })
      })
      .subscribe()

    // ── 3. Approvals (HITL gate notifications) ────────────────────────────
    const approvalsChannel = supabase
      .channel(`approvals:${courseId}`)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'approvals',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const approval = payload.new as Approval
        queryClient.setQueryData<Approval[]>(['approvals', courseId], old => {
          const existing = old ?? []
          const idx = existing.findIndex(a => a.id === approval.id)
          if (idx >= 0) {
            const next = [...existing]
            next[idx] = approval
            return next
          }
          return [approval, ...existing]
        })
        invalidate([['dashboard', courseId]])
      })
      .subscribe()

    // ── 4. Analytics tasks (optimization feed) ────────────────────────────
    const tasksChannel = supabase
      .channel(`analytics_tasks:${courseId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'analytics_tasks',
        filter: `course_id=eq.${courseId}`,
      }, (payload) => {
        const task = payload.new as AnalyticsTask
        queryClient.setQueryData<AnalyticsTask[]>(['analytics_tasks', courseId], old =>
          [task, ...(old ?? [])]
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(courseChannel)
      supabase.removeChannel(logsChannel)
      supabase.removeChannel(approvalsChannel)
      supabase.removeChannel(tasksChannel)
    }
  }, [courseId, queryClient, supabase, invalidate])
}
