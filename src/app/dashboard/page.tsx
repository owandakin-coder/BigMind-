'use client'
export const dynamic = 'force-dynamic'
/**
 * Dashboard — /dashboard
 * Course library listing all user courses with status, pipeline progress,
 * and quick-action buttons. Fully wired to real Supabase data.
 */

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useCourseLibrary, useCreateCourse, useDeleteCourse } from '@/hooks/useCourseLibrary'
import { useCredits } from '@/hooks/useCredits'
import { StatusPill } from '@/components/ui/StatusPill'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import type { CourseStatus } from '@/lib/state-machine/courseStateMachine'
import type { Database } from '@/types/database.types'

type Course = Database['public']['Tables']['courses']['Row']

/**
 * Translate raw backend errors into plain language for the create-course form.
 * Front-end only — does not change any policy or backend behaviour.
 */
function friendlyCreateError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('violates row-level security')) {
    return "You've reached your plan's course limit. Delete an existing course, or upgrade your plan, to create a new one."
  }
  if (m.includes('not authenticated') || m.includes('jwt')) {
    return 'Your session has expired. Please refresh the page and sign in again.'
  }
  if (m.includes('duplicate') || m.includes('unique')) {
    return 'A course with these details already exists.'
  }
  return message || 'Something went wrong creating the course. Please try again.'
}

/* ── Credit bar ─────────────────────────────────────────────── */
function CreditBar() {
  const { data: credits, isLoading } = useCredits()
  if (isLoading || !credits) return null

  const barColor = credits.is_exhausted
    ? 'var(--color-red-500)'
    : credits.pct_used > 80 ? 'var(--color-amber-400)' : 'var(--color-green-500)'

  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--surface-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-4) var(--space-5)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-4)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' }}>
            AI Credits
          </span>
          <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {credits.plan === 'enterprise' ? '∞ credits' : `${credits.ai_credits.toLocaleString()} credits left`}
          </span>
        </div>
        {credits.plan !== 'enterprise' && (
          <div style={{ height: 6, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${credits.pct_used}%`,
              background: barColor,
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        )}
      </div>
      <Badge variant={credits.plan === 'enterprise' ? 'success' : credits.plan === 'pro' ? 'brand' : 'default'}>
        {credits.plan.toUpperCase()}
      </Badge>
      {credits.is_exhausted && (
        <Button variant="primary" size="sm">Upgrade</Button>
      )}
    </div>
  )
}

/* ── New course dialog ──────────────────────────────────────── */
function NewCourseModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle]   = useState('')
  const [niche, setNiche]   = useState('')
  const [idea, setIdea]     = useState('')
  const { mutate, isPending, isError, error } = useCreateCourse()
  const router = useRouter()

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !niche.trim() || idea.trim().length < 11) return
    mutate({ title: title.trim(), niche: niche.trim(), courseIdea: idea.trim() }, {
      onSuccess: (course) => {
        onClose()
        router.push(`/courses/${course.id}`)
      },
    })
  }, [title, niche, idea, mutate, onClose, router])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: 'var(--surface-base)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-8)',
        width: 480,
        display: 'flex', flexDirection: 'column', gap: 'var(--space-5)',
      }}>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>
          New Course
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' }}>
            Course Title <span style={{ color: 'var(--color-red-400)' }}>*</span>
          </label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. AI-Powered Freelancing Masterclass"
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' }}>
            Target Niche <span style={{ color: 'var(--color-red-400)' }}>*</span>
          </label>
          <input
            value={niche}
            onChange={e => setNiche(e.target.value)}
            placeholder="e.g. freelance software development"
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
              width: '100%',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontWeight: 'var(--weight-medium)' }}>
            Course Idea <span style={{ color: 'var(--color-red-400)' }}>*</span>
          </label>
          <textarea
            value={idea}
            onChange={e => setIdea(e.target.value)}
            placeholder="e.g. Teach developers how to land freelance clients using AI tools and build recurring revenue"
            rows={3}
            style={{
              background: 'var(--surface-sunken)',
              border: '1px solid var(--surface-border)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-3)',
              color: 'var(--text-primary)',
              fontSize: 'var(--text-sm)',
              outline: 'none',
              width: '100%',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <p style={{ fontSize: 'var(--text-xs)', color: idea.trim().length >= 11 ? 'var(--text-tertiary)' : 'var(--color-amber-400)' }}>
            {idea.trim().length >= 11
              ? 'The AI will research this niche and validate the idea against market demand.'
              : `Describe your idea in a sentence — at least 11 characters (${idea.trim().length}/11).`}
          </p>
        </div>
        {isError && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-red-400)' }}>
            {friendlyCreateError((error as Error).message)}
          </p>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={isPending}
            onClick={handleSubmit}
            disabled={!title.trim() || !niche.trim() || idea.trim().length < 11}
          >
            Create Course
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ── Course card ────────────────────────────────────────────── */
function CourseCard({ course }: { course: Course }) {
  const router = useRouter()
  const { mutate: deleteCourse, isPending: isDeleting } = useDeleteCourse()

  const status = course.status as CourseStatus
  const isPublished  = course.published_at != null
  const updatedAt    = new Date(course.updated_at).toLocaleDateString()

  return (
    <Card
      style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
      onClick={() => router.push(`/courses/${course.id}`)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
            <h3 style={{
              fontSize: 'var(--text-base)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {course.title}
            </h3>
            <StatusPill status={status} />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              {course.target_niche}
            </span>
            {course.price_usd && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                ${course.price_usd}
              </span>
            )}
            {isPublished && (
              <Badge variant="success">Published</Badge>
            )}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Updated {updatedAt}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (confirm('Delete this course? This cannot be undone.')) {
              deleteCourse(course.id)
            }
          }}
          disabled={isDeleting}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-tertiary)', padding: 'var(--space-1)',
            opacity: isDeleting ? 0.5 : 1,
          }}
          title="Delete course"
        >
          {isDeleting ? <Spinner size={14} /> : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          )}
        </button>
      </div>
    </Card>
  )
}

/* ── Main dashboard ─────────────────────────────────────────── */
export default function DashboardPage() {
  const { data: courses, isLoading, isError } = useCourseLibrary()
  const [showNew, setShowNew] = useState(false)

  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner size={32} />
    </div>
  )

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--space-8) var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-8)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text-primary)' }}>
            Course Library
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 'var(--space-1)' }}>
            {courses?.length ?? 0} course{courses?.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowNew(true)}>
          + New Course
        </Button>
      </div>

      {/* Credit bar */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <CreditBar />
      </div>

      {/* Course grid */}
      {isError ? (
        <EmptyState
          title="Failed to load courses"
          description="Check your connection and try refreshing."
        />
      ) : !courses?.length ? (
        <EmptyState
          title="No courses yet"
          description="Create your first AI-powered course to get started."
          action={<Button variant="primary" onClick={() => setShowNew(true)}>+ Create Course</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {courses.map(course => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}

      {showNew && <NewCourseModal onClose={() => setShowNew(false)} />}
    </div>
  )
}
