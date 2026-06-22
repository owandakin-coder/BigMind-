// src/hooks/useBilling.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface PlanDefinition {
  id: string
  display_name: string
  ai_credits: number
  price_monthly: number
  price_annual: number
  features: string[]
  limits: { courses: number; exports: number; platforms: number }
}

export interface BillingSummary {
  id: string
  plan: string
  plan_name: string
  ai_credits: number
  credits_limit: number
  billing_status: 'active' | 'past_due' | 'canceled' | 'trialing'
  trial_ends_at: string | null
  current_period_end: string | null
  credits_reset_at: string
  admin_override: boolean
  price_monthly: number
  features: string[]
  limits: { courses: number; exports: number; platforms: number }
  credits_used_pct: number
}

export function useBillingSummary() {
  return useQuery<BillingSummary>({
    queryKey: ['billing-summary'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Not authenticated')
      const user = session.user

      const { data, error } = await supabase
        .from('user_billing_summary')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) throw error
      return data as BillingSummary
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}

export function usePlans() {
  return useQuery<PlanDefinition[]>({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plan_definitions')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true })

      if (error) throw error
      return data as PlanDefinition[]
    },
    staleTime: 5 * 60_000, // plans rarely change
  })
}

export function useCanGenerate(creditCost = 1) {
  return useQuery<{
    allowed: boolean
    reason?: string
    credits?: number
    required?: number
    plan?: string
    upgradeUrl?: string
  }>({
    queryKey: ['can-generate', creditCost],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return { allowed: false, reason: 'not_authenticated' }

      const { data, error } = await supabase.rpc('can_generate', {
        p_user_id: user.id,
        p_credit_cost: creditCost,
      })

      if (error) throw error
      return data as unknown as { allowed: boolean; reason?: string; credits?: number; required?: number; plan?: string; upgradeUrl?: string }
    },
    staleTime: 10_000,
  })
}

export function useCreditUsageLog(limit = 20) {
  return useQuery({
    queryKey: ['credit-usage-log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('credit_usage_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data
    },
    staleTime: 30_000,
  })
}
