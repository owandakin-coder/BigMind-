'use client'
/**
 * SalesPagePreview — renders the generated sales copy as a readable, styled
 * landing page. Read-only, from the existing sales_copy digital asset.
 */
import React from 'react'
import { useCourseAssets } from '@/hooks/useCourseAssets'
import { Spinner } from '@/components/ui/Spinner'

export function SalesPagePreview({ courseId }: { courseId: string }) {
  const { data, isLoading } = useCourseAssets(courseId)

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner size={24} /></div>
  const sp = data?.salesPage
  if (!sp) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>No sales page yet — run the Sales Page agent.</div>

  const price = sp.pricing_section?.price_usd
  const sectionTitle = (t: string) => (
    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', margin: '0 0 var(--space-3)' }}>{t}</h3>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: 'var(--space-7) 0 var(--space-5)' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 12 }}>{sp.headline}</h1>
        {sp.subheadline && <p style={{ fontSize: 'var(--text-lg)', color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 620, margin: '0 auto' }}>{sp.subheadline}</p>}
        {sp.cta_buttons?.[0]?.text && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <span style={{ display: 'inline-block', background: 'var(--color-indigo-500, var(--color-indigo-400))', color: '#fff', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', padding: '12px 28px', borderRadius: 'var(--radius-md)' }}>{sp.cta_buttons[0].text}</span>
            {sp.cta_buttons[0].subtext && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 8 }}>{sp.cta_buttons[0].subtext}</p>}
          </div>
        )}
      </div>

      {/* Problem → solution */}
      {sp.hero_section && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-5)', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-5)' }}>
          {sp.hero_section.problem_agitation && <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{sp.hero_section.problem_agitation}</p>}
          {sp.hero_section.solution_promise && <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)', lineHeight: 1.6 }}>{sp.hero_section.solution_promise}</p>}
        </div>
      )}

      {/* Benefits */}
      {!!sp.benefits?.length && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          {sectionTitle('What you get')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 'var(--space-3)' }}>
            {sp.benefits.map((b, i) => (
              <div key={i} style={{ padding: 'var(--space-4)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 4 }}>{b.title}</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Social proof */}
      {(!!sp.social_proof?.stat_claims?.length || !!sp.social_proof?.trust_badges?.length) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'center', marginBottom: 'var(--space-6)' }}>
          {(sp.social_proof?.stat_claims ?? []).concat(sp.social_proof?.trust_badges ?? []).map((s, i) => (
            <span key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', background: 'var(--surface-sunken)', padding: '6px 12px', borderRadius: 99 }}>{s}</span>
          ))}
        </div>
      )}

      {/* Pricing */}
      {sp.pricing_section && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6)', border: '2px solid var(--color-indigo-400)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-6)' }}>
          {typeof price === 'number' && <div style={{ fontSize: 'var(--text-3xl, var(--text-2xl))', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>${price}</div>}
          {!!sp.pricing_section.payment_plans?.length && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 4 }}>
              or {sp.pricing_section.payment_plans.map(p => p.label).filter(Boolean).join(' · ')}
            </p>
          )}
          {sp.pricing_section.guarantee && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-green-400)', marginTop: 'var(--space-3)' }}>{sp.pricing_section.guarantee}</p>}
          {sp.pricing_section.scarcity_element && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-amber-400)', marginTop: 6 }}>{sp.pricing_section.scarcity_element}</p>}
        </div>
      )}

      {/* Objection handling */}
      {!!sp.objection_handling?.length && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          {sectionTitle('Still on the fence?')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {sp.objection_handling.map((o, i) => (
              <div key={i}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 2 }}>{o.objection}</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{o.response}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAQ */}
      {!!sp.faq?.length && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          {sectionTitle('FAQ')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {sp.faq.map((f, i) => (
              <div key={i}>
                <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: 2 }}>{f.question}</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{f.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
