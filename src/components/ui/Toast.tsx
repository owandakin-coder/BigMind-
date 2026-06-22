/**
 * Toast — lightweight toast notification system.
 * Usage: const { toast } = useToast(); toast.success('Message')
 *
 * Rendered at root via <ToastProvider /> in layout.tsx.
 */
'use client'

import React, { createContext, useContext, useCallback, useState, useEffect } from 'react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  message: string
  detail?: string
  duration: number
}

interface ToastContext {
  toast: {
    success: (message: string, detail?: string) => void
    error:   (message: string, detail?: string) => void
    warning: (message: string, detail?: string) => void
    info:    (message: string, detail?: string) => void
  }
}

const ToastCtx = createContext<ToastContext | null>(null)

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', icon: '✓' },
  error:   { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',  icon: '✕' },
  warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', icon: '!' },
  info:    { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.3)', icon: 'i' },
}

const ICON_COLORS: Record<ToastType, string> = {
  success: 'var(--color-green-400)',
  error:   'var(--color-red-400)',
  warning: 'var(--color-amber-400)',
  info:    'var(--color-indigo-400)',
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const colors = TOAST_COLORS[item.type]

  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), item.duration)
    return () => clearTimeout(t)
  }, [item.id, item.duration, onDismiss])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
        maxWidth: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        cursor: 'pointer',
        animation: 'slideInRight 0.2s ease',
      }}
      onClick={() => onDismiss(item.id)}
    >
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 'bold',
        background: ICON_COLORS[item.type],
        color: '#000',
        flexShrink: 0, marginTop: 1,
      }}>
        {colors.icon}
      </span>
      <div>
        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)', marginBottom: item.detail ? 2 : 0 }}>
          {item.message}
        </p>
        {item.detail && (
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {item.detail}
          </p>
        )}
      </div>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const add = useCallback((type: ToastType, message: string, detail?: string, duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev.slice(-4), { id, type, message, detail: detail ?? '', duration }])
  }, [])

  const toast = {
    success: (m: string, d?: string) => add('success', m, d),
    error:   (m: string, d?: string) => add('error', m, d, 6000),
    warning: (m: string, d?: string) => add('warning', m, d, 5000),
    info:    (m: string, d?: string) => add('info', m, d),
  }

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 'var(--space-6)', right: 'var(--space-6)',
        zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'all' }}>
            <ToastItem item={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
