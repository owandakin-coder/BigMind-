// useCredits.ts — Live credit balance + plan info for the authenticated user
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserClient } from '@/lib/supabase/client'

export interface CreditInfo {
  ai_credits: number
  credits_limit: number
  plan: 'free' | 'starter' | 'pro' | 'enterprise'
  pct_used: number
  is_exhausted: boolean
}

export function useCredits() {
  const supabase = createBrowserClient()

  return useQuery<CreditInfo>({
    queryKey: ['credits'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated')
      const user = session.user

      const { data, error } = await supabase
        .from('user_profiles')
        .select('ai_credits, credits_limit, plan')
        .eq('id', user.id)
        .single()

      if (error) throw error

      const ai_credits   = data.ai_credits    ?? 0
      const credits_limit = data.credits_limit ?? 100

      return {
        ai_credits,
        credits_limit,
        plan:         (data.plan ?? 'free') as CreditInfo['plan'],
        pct_used:     Math.max(0, Math.min(100, Math.round(((credits_limit - ai_credits) / credits_limit) * 100))),
        is_exhausted: data.plan !== 'enterprise' && ai_credits <= 0,
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
