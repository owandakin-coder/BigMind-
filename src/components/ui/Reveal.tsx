'use client'
/**
 * Reveal — fades + lifts its children into view on scroll (IntersectionObserver).
 * Dependency-free. Falls back to visible immediately if IO is unavailable.
 */
import React, { useEffect, useRef } from 'react'

interface RevealProps {
  children: React.ReactNode
  /** Stagger in ms. */
  delay?: number
  style?: React.CSSProperties
  className?: string
}

export function Reveal({ children, delay = 0, style, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible')
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add('is-visible')
            io.unobserve(el)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={['cf-reveal', className].filter(Boolean).join(' ')}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  )
}
