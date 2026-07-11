'use client'
/**
 * useUpdateSalesPage — owner edits the generated sales page by updating the
 * course-level sales_copy digital asset directly (the assets_update_unlocked
 * RLS policy already permits owners to update course-level assets).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

export function useUpdateSalesPage(courseId: string) {
  const supabase    = createBrowserClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ assetId, content }: { assetId: string; content: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('digital_assets')
        .update({ content_json: content })
        .eq('id', assetId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course-assets', courseId] }),
  })
}
