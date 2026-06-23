'use client'
export const dynamic = 'force-dynamic'
/**
 * /courses/[id]/preview — standalone, student-facing preview of the finished
 * course. This is what "View course" opens and what the share link points to.
 */
import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CoursePreview } from '@/components/preview/CoursePreview'

export default function CoursePreviewPage() {
  const params = useParams<{ courseId: string }>()
  const router = useRouter()
  const courseId = params.courseId

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--surface-base)' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
        padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--surface-border)',
        position: 'sticky', top: 0, background: 'var(--surface-raised)', zIndex: 10,
      }}>
        <button onClick={() => router.push(`/courses/${courseId}`)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
          border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
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
