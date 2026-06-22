// useCourseAgent.ts — Invokes agent via Edge Function with loading state
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { AgentName, CourseStatus } from '@/types/database.types'

interface AgentInput {
  courseId:           string
  niche:              string
  mvcOnly?:           boolean
  isPreLaunch?:       boolean
  targetModuleIndex?: number
  pivotNiche?:        string
}

interface AgentResult {
  success:    boolean
  nextStatus: CourseStatus
  agentName:  AgentName
  summary:    Record<string, unknown>
}

export function useCourseAgent() {
  const queryClient = useQueryClient()
  const supabase    = createClient()

  return useMutation<AgentResult, Error, AgentInput>({
    mutationFn: async (input) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated')

      const { data, error } = await supabase.functions.invoke('execute-agent-workflow', {
        body: {
          courseId:    input.courseId,
          userId:      session.user.id,
          niche:       input.niche,
          mvcOnly:     input.mvcOnly,
          isPreLaunch: input.isPreLaunch,
        },
      })
      if (error) throw new Error(error.message)
      if (data?.error) throw new Error(data.message ?? data.error)
      return data as AgentResult
    },

    onSuccess: (data, { courseId }) => {
      queryClient.invalidateQueries({ queryKey: ['course',     courseId] })
      queryClient.invalidateQueries({ queryKey: ['agent_logs', courseId] })
      queryClient.invalidateQueries({ queryKey: ['approvals',  courseId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard',  courseId] })

      if (data.agentName === 'market_research_agent') {
        queryClient.invalidateQueries({ queryKey: ['market_report', courseId] })
      }
      if (data.agentName === 'course_architect_agent') {
        queryClient.invalidateQueries({ queryKey: ['blueprint', courseId] })
        queryClient.invalidateQueries({ queryKey: ['modules',   courseId] })
      }
      if (data.agentName === 'content_production_agent') {
        queryClient.invalidateQueries({ queryKey: ['digital_assets', courseId] })
      }
    },
  })
}
