// src/hooks/useObservability.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export function useAgentMetrics() {
  return useQuery({
    queryKey: ['agent-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_performance_live')
        .select('*')
      if (error) throw error
      return data
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  })
}

export function useFailedWorkflows(limit = 50) {
  return useQuery({
    queryKey: ['failed-workflows', limit],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return []
      const { data, error } = await supabase
        .from('failed_workflows')
        .select('*')
        .eq('user_id', user.id)
        .limit(limit)
      if (error) throw error
      return data
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
}

export function useDeadLetterQueue() {
  return useQuery({
    queryKey: ['dead-letter-queue'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dead_letter_queue')
        .select('*, courses(title)')
        .in('status', ['pending', 'retrying'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  })
}

export function useRetryHistory(dlqId?: string) {
  return useQuery({
    queryKey: ['retry-history', dlqId],
    queryFn: async () => {
      if (!dlqId) return []
      const { data, error } = await supabase
        .from('retry_history')
        .select('*')
        .eq('dlq_id', dlqId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!dlqId,
    staleTime: 10_000,
  })
}

export function useAuditTrail(courseId?: string, limit = 100) {
  return useQuery({
    queryKey: ['audit-trail', courseId, limit],
    queryFn: async () => {
      let query = supabase
        .from('audit_trail')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (courseId) query = query.eq('course_id', courseId)

      const { data, error } = await query
      if (error) throw error
      return data
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useAIAuditLogs(courseId?: string, limit = 50) {
  return useQuery({
    queryKey: ['ai-audit-logs', courseId, limit],
    queryFn: async () => {
      let query = supabase
        .from('ai_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (courseId) query = query.eq('course_id', courseId)
      const { data, error } = await query
      if (error) throw error
      return data
    },
    staleTime: 15_000,
  })
}

export function useCostSummary() {
  return useQuery({
    queryKey: ['cost-summary'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return null
      const { data, error } = await supabase
        .from('user_usage_summary')
        .select('*')
        .eq('user_id', user.id)
        .single()
      if (error) throw error
      return data
    },
    staleTime: 60_000,
  })
}
