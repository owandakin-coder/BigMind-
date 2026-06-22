// useApprovalAction.ts — Optimistic approval with rollback + toasts + audit log
'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import type { Database } from '@/types/database.types'

type Course    = Database['public']['Tables']['courses']['Row']
type Approval  = Database['public']['Tables']['approvals']['Row']
type CourseStatus = string

/** DB approval_action enum values */
export type ApprovalActionValue = 'approve' | 'reject' | 'regenerate' | 'pivot' | 'approve_and_lock'

interface ApprovalInput {
  approvalId:  string
  action:      ApprovalActionValue
  feedback?:   string
}

// Optimistic next-status prediction (mirrors perform_approval_action DB function)
const OPTIMISTIC_NEXT: Partial<Record<CourseStatus, Partial<Record<ApprovalActionValue, CourseStatus>>>> = {
  market_review:       { approve: 'architecture_design', approve_and_lock: 'architecture_design', reject: 'market_rejected',      pivot: 'market_pivot'       },
  market_pivot:        { approve: 'market_research',                                               reject: 'failed'                                             },
  architecture_review: { approve: 'content_generation',  approve_and_lock: 'content_generation',  reject: 'architecture_rejected'                              },
  content_review:      { approve: 'sales_page_generation', approve_and_lock: 'sales_page_generation', reject: 'content_generation'                             },
  sales_page_review:   { approve: 'marketing_prep',                                               reject: 'sales_page_generation'                               },
  marketing_review:    { approve: 'final_approval_gate',                                           reject: 'marketing_prep'                                     },
  final_approval_gate: { approve: 'publishing',          approve_and_lock: 'publishing',           reject: 'marketing_review'                                   },
}

const ACTION_LABELS: Record<ApprovalActionValue, string> = {
  approve:       'Approved',
  approve_and_lock: 'Approved & Locked',
  reject:        'Rejected',
  regenerate:    'Regeneration triggered',
  pivot:         'Pivot requested',
}

export function useApprovalAction(courseId: string) {
  const queryClient = useQueryClient()
  const supabase    = createBrowserClient()
  const { toast }   = useToast()

  return useMutation({
    mutationFn: async ({ approvalId, action, feedback }: ApprovalInput) => {
      const { data, error } = await supabase.functions.invoke('perform-approval-action', {
        body: { approvalId, action, feedback },
      })
      if (error) throw new Error(error.message ?? 'Approval action failed')
      if (data?.error) throw new Error(data.message ?? data.error)
      return data as { success: boolean; newStatus: string; locked: boolean }
    },

    // Optimistic update — apply predicted state immediately
    onMutate: async ({ approvalId, action }) => {
      await queryClient.cancelQueries({ queryKey: ['course',    courseId] })
      await queryClient.cancelQueries({ queryKey: ['approvals', courseId] })

      const prevCourse    = queryClient.getQueryData<Course>   (['course',    courseId])
      const prevApprovals = queryClient.getQueryData<Approval[]>(['approvals', courseId])

      if (prevCourse) {
        const nextStatus = OPTIMISTIC_NEXT[prevCourse.status as CourseStatus]?.[action]
        if (nextStatus) {
          queryClient.setQueryData<Course>(['course', courseId], old =>
            old ? { ...old, status: nextStatus as Course['status'] } : old
          )
        }
      }

      queryClient.setQueryData<Approval[]>(['approvals', courseId], old =>
        (old ?? []).map(a =>
          a.id === approvalId
            ? { ...a, action, is_pending: false, reviewed_at: new Date().toISOString() }
            : a
        )
      )

      return { prevCourse, prevApprovals }
    },

    onError: (err, _vars, context) => {
      // Rollback optimistic updates
      if (context?.prevCourse)    queryClient.setQueryData(['course',    courseId], context.prevCourse)
      if (context?.prevApprovals) queryClient.setQueryData(['approvals', courseId], context.prevApprovals)
      toast.error('Action failed', err instanceof Error ? err.message : 'Unknown error')
    },

    onSuccess: (data, { action, feedback }) => {
      toast.success(ACTION_LABELS[action], data.newStatus ? `→ ${data.newStatus}` : undefined)

      // Insert client-side audit entry (also done server-side via RPC, this is UI feedback)
      if (action === 'regenerate' && feedback) {
        toast.info('Agent regeneration queued', 'The agent will re-run with your feedback.')
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['course',        courseId] })
      queryClient.invalidateQueries({ queryKey: ['approvals',     courseId] })
      queryClient.invalidateQueries({ queryKey: ['agent_logs',    courseId] })
      queryClient.invalidateQueries({ queryKey: ['course-library']           })
    },
  })
}
