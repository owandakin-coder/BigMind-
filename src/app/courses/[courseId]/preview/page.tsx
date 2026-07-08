'use client'
export const dynamic = 'force-dynamic'
/**
 * /courses/[id]/preview — standalone, student-facing preview of the finished
 * course. This is what "View course" opens and what the share link points to.
 */
import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CoursePreview } from '@/components/preview/CoursePreview'
import { BrandMark } from '@/components/ui/TopNav'

export default function CoursePreviewPage() {
  const params = useParams<{ courseId: string }>()
  const router = useRouter()
  const courseId = params.courseId

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-base)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
        height: 60, padding: '0 var(--space-6)', borderBottom: '1px solid var(--surface-border)',
        position: 'sticky', top: 0,
        background: 'rgba(10,10,15,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <BrandMark size={26} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-secondary)' }}>
            CourseForge<span className="cf-gradient-text"> AI</span>
          </span>
        </div>
        <button onClick={() => router.push(`/courses/${courseId}`)} className="cf-navlink" style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back to editor
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', border: '1px solid var(--surface-border)', borderRadius: 99, padding: '3px 12px' }}>
          Student preview
        </span>
      </header>
      <main style={{ padding: '0 var(--space-6) var(--space-8)' }}>
        <CoursePreview courseId={courseId} />
      </main>
    </div>
  )
}
