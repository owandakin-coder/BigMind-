/**
 * AgentLogFeed — real-time scrolling log of agent activity.
 * Driven by useRealtimeCourse INSERT subscription on agent_logs.
 */
'use client'

import React, { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Database } from '@/types/database.types'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { createBrowserClient } from '@/lib/supabase/client'

type AgentLog = Database['public']['Tables']['agent_logs']['Row']

const AGENT_BADGE_MAP: Record<string, Parameters<typeof Badge>[0]['variant']> = {
  market_research_agent:    'agent',
  course_architect_agent:   'brand',
  content_production_agent: 'agent',
  sales_page_agent:         'info',
  marketing_agent:          'agent',
  analytics_agent:          'info',
  publishing_agent:         'publishing',
}

const AGENT_SHORT: Record<string, string> = {
  market_research_agent:    'MKT',
  course_architect_agent:   'ARC',
  content_production_agent: 'CNT',
  sales_page_agent:         'SLS',
  marketing_agent:          'MKG',
  analytics_agent:          'ANL',
  publishing_agent:         'PUB',
}

function formatTs(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function LogRow({ log }: { log: AgentLog }) {
  const badgeVariant = AGENT_BADGE_MAP[log.agent] ?? 'default'
  const short = AGENT_SHORT[log.agent] ?? log.agent.slice(0, 3).toUpperCase()
  const isError = Boolean(log.error_message)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 36px 1fr auto',
      gap: 'var(--space-3)',
      alignItems: 'start',
      padding: 'var(--space-2) var(--space-4)',
      borderBottom: '1px solid var(--surface-border-subtle)',
    }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', paddingTop: 2 }}>
        {formatTs(log.created_at)}
      </span>
      <Badge variant={badgeVariant} style={{ fontSize: 9, padding: '1px 5px' }}>
        {short}
      </Badge>
      <div>
        <p style={{ fontSize: 'var(--text-sm)', color: isError ? 'var(--color-red-400)' : 'var(--text-secondary)', lineHeight: 'var(--leading-snug)' }}>
          {isError ? log.error_message : (log as unknown as Record<string, unknown>)['output_summary'] as string ?? `Agent run complete`}
        </p>
      </div>
      {log.total_cost_usd != null && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', paddingTop: 2 }}>
          −{log.total_cost_usd} cr
        </span>
      )}
    </div>
  )
}

interface AgentLogFeedProps {
  courseId: string
  /** Live logs injected from the Realtime subscription in the parent */
  liveLogs?: AgentLog[]
  maxRows?: number
}

export function AgentLogFeed({ courseId, liveLogs = [], maxRows = 50 }: AgentLogFeedProps) {
  const supabase  = createBrowserClient()
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: historicalLogs, isLoading } = useQuery({
    queryKey: ['agent-logs-feed', courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false })
        .limit(maxRows)
      return (data ?? []).reverse()
    },
  })

  // Merge live + historical, dedup by id
  const allLogs = React.useMemo(() => {
    const merged = [...(historicalLogs ?? []), ...liveLogs]
    const seen = new Set<string>()
    const deduped = merged.filter(l => {
      if (seen.has(l.id)) return false
      seen.add(l.id)
      return true
    })
    return deduped.sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-maxRows)
  }, [historicalLogs, liveLogs, maxRows])

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [allLogs.length])

  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--surface-border)',
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: 'var(--space-4) var(--space-6)',
        borderBottom: '1px solid var(--surface-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}>
        <span className="cf-pulse" aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-green-500)', boxShadow: '0 0 8px var(--color-green-500)' }} />
        <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
          Agent activity
        </h3>
        {isLoading && <Spinner size={14} />}
        <Badge variant="default" style={{ marginLeft: 'auto' }}>{allLogs.length} entries</Badge>
      </div>

      <div
        ref={scrollRef}
        style={{ overflowY: 'auto', maxHeight: 280 }}
      >
        {allLogs.length === 0 && !isLoading ? (
          <p style={{ padding: 'var(--space-6)', textAlign: 'center', fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            No agent activity yet. Launch the workflow to begin.
          </p>
        ) : (
          allLogs.map(log => <LogRow key={log.id} log={log} />)
        )}
      </div>
    </div>
  )
}
