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
      // Reveal well before the element scrolls into view so fast scrolling never
      // catches it mid-fade; the animation has settled by the time it's on screen.
      { threshold: 0, rootMargin: '0px 0px 300px 0px' },
    )
    io.observe(el)
    // Safety net: if the observer never fires (edge cases), force-reveal shortly.
    const t = setTimeout(() => el.classList.add('is-visible'), 1200)
    return () => { io.disconnect(); clearTimeout(t) }
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
