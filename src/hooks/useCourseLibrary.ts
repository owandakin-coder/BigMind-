// useCourseLibrary.ts — All courses for the authenticated user
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database.types'

type Course = Database['public']['Tables']['courses']['Row']

export function useCourseLibrary() {
  const supabase = createBrowserClient()

  return useQuery<Course[]>({
    queryKey: ['course-library'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated')
      const user = session.user

      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    staleTime: 10_000,
  })
}

export function useCreateCourse() {
  const supabase    = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ title, niche, courseIdea }: { title: string; niche: string; courseIdea: string }) => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated')
      const user = session.user

      const { data, error } = await supabase
        .from('courses')
        .insert({ owner_id: user.id, title, target_niche: niche, course_idea: courseIdea, status: 'draft' })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-library'] })
    },
  })
}

export function useDeleteCourse() {
  const supabase    = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (courseId: string) => {
      // Soft delete via SECURITY DEFINER RPC (migration 0019). A hard DELETE would
      // cascade to the immutable agent_logs table and fail for any course that ran
      // an agent; the RPC sets deleted_at after verifying ownership. RLS
      // (courses_select_own filters deleted_at IS NULL) then hides it from the library.
      const { error } = await supabase.rpc('soft_delete_course', { p_course_id: courseId })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-library'] })
    },
  })
}
