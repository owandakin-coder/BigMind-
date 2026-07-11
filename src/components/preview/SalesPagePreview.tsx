'use client'
/**
 * SalesPagePreview — renders the generated sales copy as a readable, styled
 * landing page. Read-only, from the existing sales_copy digital asset.
 */
import React, { useState } from 'react'
import { useCourseAssets } from '@/hooks/useCourseAssets'
import { useUpdateSalesPage } from '@/hooks/useUpdateSalesPage'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

const spLabel: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }
const spInput: React.CSSProperties = { background: 'var(--surface-sunken)', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', outline: 'none', width: '100%', fontFamily: 'var(--font-sans)' }

export function SalesPagePreview({ courseId, editable = true }: { courseId: string; editable?: boolean }) {
  const { data, isLoading } = useCourseAssets(courseId)
  const { mutate: saveSales, isPending: saving, isError: saveError } = useUpdateSalesPage(courseId)
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ headline: '', subheadline: '', problem: '', solution: '', price: '', guarantee: '', cta: '' })

  if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><Spinner size={24} /></div>
  const sp = data?.salesPage
  if (!sp) return <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-tertiary)' }}>No sales page yet — run the Sales Page agent.</div>

  const price = sp.pricing_section?.price_usd

  const startEdit = () => {
    setF({
      headline:   sp.headline ?? '',
      subheadline: sp.subheadline ?? '',
      problem:    sp.hero_section?.problem_agitation ?? '',
      solution:   sp.hero_section?.solution_promise ?? '',
      price:      price != null ? String(price) : '',
      guarantee:  sp.pricing_section?.guarantee ?? '',
      cta:        sp.cta_buttons?.[0]?.text ?? '',
    })
    setEditing(true)
  }
  const doSave = () => {
    if (!data?.salesPageId) return
    const content: Record<string, unknown> = {
      ...(sp as unknown as Record<string, unknown>),
      headline: f.headline,
      subheadline: f.subheadline,
      hero_section: { ...(sp.hero_section ?? {}), problem_agitation: f.problem, solution_promise: f.solution },
      pricing_section: { ...(sp.pricing_section ?? {}), price_usd: f.price.trim() === '' ? sp.pricing_section?.price_usd : Number(f.price), guarantee: f.guarantee },
      cta_buttons: [{ ...(sp.cta_buttons?.[0] ?? { position: 'hero' }), text: f.cta || 'Enroll Now' }, ...(sp.cta_buttons?.slice(1) ?? [])],
    }
    saveSales({ assetId: data.salesPageId, content }, { onSuccess: () => setEditing(false) })
  }

  if (editing) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>Edit sales page</h3>
        <label style={spLabel}>Headline</label>
        <input value={f.headline} onChange={e => setF({ ...f, headline: e.target.value })} style={spInput} />
        <label style={spLabel}>Subheadline</label>
        <textarea value={f.subheadline} onChange={e => setF({ ...f, subheadline: e.target.value })} rows={2} style={{ ...spInput, resize: 'vertical' }} />
        <label style={spLabel}>Problem (agitation)</label>
        <textarea value={f.problem} onChange={e => setF({ ...f, problem: e.target.value })} rows={3} style={{ ...spInput, resize: 'vertical' }} />
        <label style={spLabel}>Solution promise</label>
        <textarea value={f.solution} onChange={e => setF({ ...f, solution: e.target.value })} rows={3} style={{ ...spInput, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <div style={{ flex: 1 }}><label style={spLabel}>Price (USD)</label><input value={f.price} onChange={e => setF({ ...f, price: e.target.value })} inputMode="numeric" style={spInput} /></div>
          <div style={{ flex: 2 }}><label style={spLabel}>CTA button</label><input value={f.cta} onChange={e => setF({ ...f, cta: e.target.value })} style={spInput} /></div>
        </div>
        <label style={spLabel}>Guarantee</label>
        <input value={f.guarantee} onChange={e => setF({ ...f, guarantee: e.target.value })} style={spInput} />
        {saveError && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-red-400)' }}>Couldn&rsquo;t save — please try again.</p>}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <Button variant="primary" size="sm" loading={saving} onClick={doSave}>Save changes</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </div>
    )
  }
  const sectionTitle = (t: string) => (
    <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', margin: '0 0 var(--space-3)' }}>{t}</h3>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      {editable && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={startEdit} className="cf-navlink" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>
            Edit sales page
          </button>
        </div>
      )}
      {/* Hero */}
      <div style={{ textAlign: 'center', padding: 'var(--space-6) 0 var(--space-5)' }}>
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
