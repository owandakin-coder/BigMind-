'use client'
/**
 * useUpdateLesson — owner edits a lesson's written content via the
 * update_lesson_content SECURITY DEFINER RPC (ownership enforced server-side).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

interface UpdateLessonInput {
  lessonId:      string
  title?:        string
  bodyMarkdown?: string
  keyTakeaways?: string[]
  callToAction?: string
}

export function useUpdateLesson(courseId: string) {
  const supabase    = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateLessonInput) => {
      const { data, error } = await supabase.rpc('update_lesson_content', {
        p_lesson_id:      input.lessonId,
        p_title:          input.title ?? null,
        p_body_markdown:  input.bodyMarkdown ?? null,
        p_key_takeaways:  input.keyTakeaways ?? null,
        p_call_to_action: input.callToAction ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['course-preview', courseId] })
    },
  })
}
