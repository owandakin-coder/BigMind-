// useCourse.ts — Single course data with agent logs, approvals, analytics
'use client'
import { useQuery } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database.types'

type Course    = Database['public']['Tables']['courses']['Row']
type AgentLog  = Database['public']['Tables']['agent_logs']['Row']
type Approval  = Database['public']['Tables']['approvals']['Row']

export function useCourse(courseId: string) {
  const supabase = createBrowserClient()

  return useQuery<Course | null>({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .single()
      if (error) return null
      return data
    },
    enabled: !!courseId,
    staleTime: 5_000,
  })
}

export function useAgentLogs(courseId: string, limit = 50) {
  const supabase = createBrowserClient()

  return useQuery<AgentLog[]>({
    queryKey: ['agent_logs', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    enabled: !!courseId,
    staleTime: 5_000,
    refetchInterval: 10_000,
  })
}

export function usePendingApprovals(courseId: string) {
  const supabase = createBrowserClient()

  return useQuery<Approval[]>({
    queryKey: ['approvals', courseId],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_pending_approvals', { p_course_id: courseId })
      return data ?? []
    },
    enabled: !!courseId,
    refetchInterval: 10_000,
  })
}

export function useAnalyticsTasks(courseId: string) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['analytics-tasks', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_tasks')
        .select('*')
        .eq('course_id', courseId)
        .eq('is_resolved', false)
        .order('priority', { ascending: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
    enabled: !!courseId,
    staleTime: 30_000,
  })
}

export function useAnalyticsMetrics(courseId: string) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['analytics-metrics', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analytics_metrics')
        .select('*')
        .eq('course_id', courseId)
        .order('recorded_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data ?? []
    },
    enabled: !!courseId,
    staleTime: 60_000,
  })
}

export function useSEOMetadata(courseId: string) {
  const supabase = createBrowserClient()

  return useQuery({
    queryKey: ['seo-metadata', courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from('seo_metadata')
        .select('*')
        .eq('course_id', courseId)
        .maybeSingle()
      return data ?? null
    },
    enabled: !!courseId,
    staleTime: 120_000,
  })
}
