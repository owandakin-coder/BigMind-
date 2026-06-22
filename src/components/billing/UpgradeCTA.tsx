// src/components/billing/UpgradeCTA.tsx
'use client'
import { useBillingSummary, usePlans } from '@/hooks/useBilling'
import Link from 'next/link'

interface UpgradeCTAProps {
  variant?: 'banner' | 'inline' | 'modal-content'
  reason?: string
}

export function UpgradeCTA({ variant = 'inline', reason }: UpgradeCTAProps) {
  const { data: billing } = useBillingSummary()
  const { data: plans } = usePlans()

  if (!billing) return null

  const isExhausted = billing.ai_credits <= 0 && billing.plan !== 'enterprise'
  const isPastDue   = billing.billing_status === 'past_due'
  const isCanceled  = billing.billing_status === 'canceled'

  if (!isExhausted && !isPastDue && !isCanceled) return null

  const nextPlan = plans?.find(p => {
    const order = ['free', 'starter', 'pro', 'enterprise']
    return order.indexOf(p.id) > order.indexOf(billing.plan)
  })

  const message = isPastDue
    ? 'Your payment is past due. Update your billing to continue.'
    : isCanceled
    ? 'Your subscription has been canceled.'
    : reason || `You've used all ${billing.credits_limit} AI credits this month.`

  if (variant === 'banner') {
    return (
      <div className="flex items-center justify-between px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
        <div>
          <span className="font-semibold text-amber-400">Credits exhausted</span>
          <span className="text-slate-400 ml-2">{message}</span>
        </div>
        <div className="flex items-center gap-3">
          {billing.plan === 'free' && (
            <Link
              href="/pricing"
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition-colors"
            >
              Upgrade to Starter →
            </Link>
          )}
          {billing.plan !== 'free' && nextPlan && (
            <Link
              href="/pricing"
              className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg text-xs transition-colors"
            >
              Upgrade to {nextPlan.display_name} →
            </Link>
          )}
        </div>
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-center space-y-3">
        <div className="text-2xl">⚡</div>
        <p className="text-sm text-slate-300 font-medium">{message}</p>
        {nextPlan && (
          <div className="text-xs text-slate-400">
            Upgrade to <strong className="text-white">{nextPlan.display_name}</strong> for{' '}
            <strong className="text-amber-400">{nextPlan.ai_credits.toLocaleString()} credits/month</strong>
          </div>
        )}
        <Link
          href="/pricing"
          className="inline-block px-6 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl text-sm transition-colors"
        >
          View Plans
        </Link>
      </div>
    )
  }

  // modal-content
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="text-4xl mb-3">⚡</div>
        <h3 className="text-xl font-bold text-white">Credits Exhausted</h3>
        <p className="text-slate-400 mt-1 text-sm">{message}</p>
      </div>

      {plans && (
        <div className="grid grid-cols-1 gap-3">
          {plans.filter(p => {
            const order = ['free', 'starter', 'pro', 'enterprise']
            return order.indexOf(p.id) > order.indexOf(billing.plan)
          }).map(plan => (
            <div key={plan.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800 border border-slate-700">
              <div>
                <div className="font-semibold text-white">{plan.display_name}</div>
                <div className="text-xs text-slate-400">{plan.ai_credits.toLocaleString()} credits/mo</div>
              </div>
              <div className="text-right">
                <div className="font-bold text-white">${plan.price_monthly}/mo</div>
                <Link href="/pricing" className="text-xs text-amber-400 hover:text-amber-300">
                  Choose →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Blocker overlay — shown when a gated action is attempted without credits
export function GenerationBlocker({ onClose }: { onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
        <UpgradeCTA variant="modal-content" />
        {onClose && (
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 text-slate-400 hover:text-white text-sm transition-colors"
          >
            Maybe later
          </button>
        )}
      </div>
    </div>
  )
}
