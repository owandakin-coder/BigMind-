'use client'
/**
 * LiveSuccess — celebratory "your course is ready" screen shown when a course
 * is live, with actions to view the generated outputs and copy a preview link.
 */
import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { createBrowserClient } from '@/lib/supabase/client'
import { exportCourseHtml } from '@/lib/exportCourse'

interface LiveSuccessProps {
  courseId: string
  onViewCourse: () => void
  onViewSales: () => void
  onViewMarketing: () => void
}

export function LiveSuccess({ courseId, onViewCourse, onViewSales, onViewMarketing }: LiveSuccessProps) {
  const [shared, setShared] = useState(false)
  const [exporting, setExporting] = useState(false)

  const sharePreview = async () => {
    // Public student page — works without login, safe to share.
    const url = `${window.location.origin}/learn/${courseId}`
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000) } catch { /* ignore */ }
  }

  const downloadCourse = async () => {
    setExporting(true)
    try { await exportCourseHtml(courseId, createBrowserClient()) } finally { setExporting(false) }
  }

  return (
    <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: 'var(--space-8) 0' }}>
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 460, height: 260, pointerEvents: 'none',
        background: 'radial-gradient(circle at 50% 30%, rgba(34,197,94,0.16), rgba(99,102,241,0.10) 45%, transparent 72%)',
      }} />
      <div style={{ position: 'relative', fontSize: 56, lineHeight: 1, marginBottom: 'var(--space-4)' }}>🎉</div>
      <h1 style={{ position: 'relative', fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)', marginBottom: 'var(--space-2)', letterSpacing: '-0.01em' }}>
        Your course is <span className="cf-gradient-text">ready</span>
      </h1>
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-6)' }}>
        Everything has been generated — the full curriculum, your sales page, and a complete marketing kit. Explore what you created:
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
        <Button variant="primary" size="lg" onClick={onViewCourse} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>}>
          View course
        </Button>
        <Button variant="secondary" size="lg" onClick={onViewSales} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>}>
          View sales page
        </Button>
        <Button variant="secondary" size="lg" onClick={onViewMarketing} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>}>
          View marketing assets
        </Button>
        <Button variant="secondary" size="lg" onClick={sharePreview} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>}>
          {shared ? 'Link copied' : 'Copy student link'}
        </Button>
        <Button variant="secondary" size="lg" loading={exporting} onClick={downloadCourse} icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>}>
          Download course
        </Button>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
        Share the preview link, or download a self-contained HTML file to host or send to students.
      </p>
    </div>
  )
}
