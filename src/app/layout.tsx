import React from 'react'
import type { Metadata } from 'next'
import '@/styles/globals.css'
import { QueryProvider } from './providers'

export const metadata: Metadata = {
  title: 'CourseForge AI',
  description: 'Autonomous enterprise-grade digital course factory',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <QueryProvider>
          {children}
        </QueryProvider>
      </body>
    </html>
  )
}
