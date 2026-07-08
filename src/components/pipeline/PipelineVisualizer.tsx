/**
 * PipelineVisualizer — DAG canvas rendering all 21 CourseForge AI workflow states.
 *
 * Layout: 6-column grid, left→right, top→bottom, following the state machine's
 * natural execution order. HITL gates rendered as diamond nodes.
 * Active state highlighted with brand glow. Agent-run states pulse.
 */
'use client'

import React, { useCallback, useMemo } from 'react'
import type { CourseStatus } from '@/lib/state-machine/courseStateMachine'
import { StatusPill } from '@/components/ui/StatusPill'

/* ── Node type definitions ─────────────────────────────────── */

type NodeType = 'start' | 'agent' | 'hitl' | 'content' | 'terminal' | 'error'

interface PipelineNode {
  id: string
  label: string
  type: NodeType
  col: number   // 1-based column (1–6)
  row: number   // 1-based row
}

interface PipelineEdge {
  from: string
  to: string
  label?: string
  style?: 'solid' | 'dashed'
}

/* ── Node registry ─────────────────────────────────────────── */

const NODES: PipelineNode[] = [
  // Col 1 — Entry
  { id: 'draft',                  label: 'Draft',               type: 'start',    col: 1, row: 3 },

  // Col 2 — Market
  { id: 'market_research',        label: 'Market Research',     type: 'agent',    col: 2, row: 2 },
  { id: 'market_review',          label: 'Market Review',       type: 'hitl',     col: 2, row: 4 },

  // Col 3 — Architecture
  { id: 'pivot_triggered',        label: 'Pivot Triggered',     type: 'error',    col: 3, row: 1 },
  { id: 'pivot_review',           label: 'Pivot Review',        type: 'hitl',     col: 3, row: 2 },
  { id: 'course_architecture',    label: 'Architecture',        type: 'agent',    col: 3, row: 3 },
  { id: 'architecture_review',    label: 'Blueprint Review',    type: 'hitl',     col: 3, row: 4 },

  // Col 4 — Content pipeline
  { id: 'content_production',     label: 'Content Production',  type: 'agent',    col: 4, row: 2 },
  { id: 'written_content',        label: 'Written',             type: 'content',  col: 4, row: 3 },
  { id: 'visual_content',         label: 'Visual',              type: 'content',  col: 4, row: 4 },
  { id: 'interactive_content',    label: 'Interactive',         type: 'content',  col: 4, row: 5 },
  { id: 'content_review',         label: 'Content Review',      type: 'hitl',     col: 4, row: 6 },

  // Col 5 — Go-to-market
  { id: 'sales_page_generation',  label: 'Sales Page',          type: 'agent',    col: 5, row: 2 },
  { id: 'marketing_assets',       label: 'Marketing',           type: 'agent',    col: 5, row: 3 },
  { id: 'analytics_review',       label: 'Analytics',           type: 'agent',    col: 5, row: 4 },
  { id: 'final_approval_gate',    label: 'Final Approval',      type: 'hitl',     col: 5, row: 5 },

  // Col 6 — Publishing
  { id: 'publishing',             label: 'Publishing',          type: 'agent',    col: 6, row: 3 },
  { id: 'publishing_confirmed',   label: 'Confirm Publish',     type: 'hitl',     col: 6, row: 4 },
  { id: 'approved',               label: 'Approved',            type: 'terminal', col: 6, row: 5 },
  { id: 'published',              label: 'Published',           type: 'terminal', col: 6, row: 6 },
  { id: 'failed',                 label: 'Failed',              type: 'error',    col: 6, row: 1 },
  { id: 'cancelled',              label: 'Cancelled',           type: 'error',    col: 6, row: 2 },
]

const EDGES: PipelineEdge[] = [
  // Happy path
  { from: 'draft',                to: 'market_research' },
  { from: 'market_research',      to: 'market_review' },
  { from: 'market_review',        to: 'course_architecture',   label: 'approve' },
  { from: 'course_architecture',  to: 'architecture_review' },
  { from: 'architecture_review',  to: 'content_production',    label: 'approve' },
  { from: 'content_production',   to: 'written_content' },
  { from: 'content_production',   to: 'visual_content' },
  { from: 'content_production',   to: 'interactive_content' },
  { from: 'written_content',      to: 'content_review' },
  { from: 'visual_content',       to: 'content_review' },
  { from: 'interactive_content',  to: 'content_review' },
  { from: 'content_review',       to: 'sales_page_generation', label: 'approve' },
  { from: 'sales_page_generation',to: 'marketing_assets' },
  { from: 'marketing_assets',     to: 'analytics_review' },
  { from: 'analytics_review',     to: 'final_approval_gate' },
  { from: 'final_approval_gate',  to: 'publishing',            label: 'approve' },
  { from: 'publishing',           to: 'publishing_confirmed' },
  { from: 'publishing_confirmed', to: 'approved',              label: 'confirm' },
  { from: 'approved',             to: 'published' },
  // Pivot path
  { from: 'market_review',        to: 'pivot_triggered',        label: 'pivot', style: 'dashed' },
  { from: 'pivot_triggered',      to: 'pivot_review' },
  { from: 'pivot_review',         to: 'market_research',        label: 'retry', style: 'dashed' },
  // Rejections → failed
  { from: 'architecture_review',  to: 'failed',                 label: 'reject', style: 'dashed' },
  { from: 'final_approval_gate',  to: 'failed',                 label: 'reject', style: 'dashed' },
]

/* ── Layout constants ──────────────────────────────────────── */

const COL_COUNT = 6
const ROW_COUNT = 7
const COL_W     = 148
const ROW_H     = 80
const NODE_W    = 128
const NODE_H    = 40
const HITL_SIZE = 44   // diamond half-diagonal
const PAD_X     = 24
const PAD_Y     = 24

const CANVAS_W  = PAD_X * 2 + COL_COUNT * COL_W
const CANVAS_H  = PAD_Y * 2 + ROW_COUNT * ROW_H

function nodeCenter(n: PipelineNode): [number, number] {
  return [
    PAD_X + (n.col - 1) * COL_W + COL_W / 2,
    PAD_Y + (n.row - 1) * ROW_H + ROW_H / 2,
  ]
}

/* ── Color helpers ─────────────────────────────────────────── */

const TYPE_COLORS: Record<NodeType, { bg: string; border: string; text: string; glow?: string }> = {
  start:    { bg: '#1c1c27', border: 'var(--color-grey-600)',    text: 'var(--color-grey-300)' },
  agent:    { bg: 'rgba(99,102,241,0.10)', border: 'var(--color-indigo-500)', text: 'var(--color-indigo-300)', glow: 'rgba(99,102,241,0.30)' },
  hitl:     { bg: 'rgba(245,158,11,0.10)', border: 'var(--color-amber-400)',  text: 'var(--color-amber-300)',  glow: 'rgba(245,158,11,0.25)' },
  content:  { bg: 'rgba(139,92,246,0.10)', border: 'var(--color-violet-400)', text: 'var(--color-violet-300)' },
  terminal: { bg: 'rgba(34,197,94,0.10)',  border: 'var(--color-green-500)',  text: 'var(--color-green-400)',  glow: 'rgba(34,197,94,0.25)' },
  error:    { bg: 'rgba(239,68,68,0.10)',  border: 'var(--color-red-400)',    text: 'var(--color-red-400)' },
}

const ACTIVE_GLOW = 'drop-shadow(0 0 8px rgba(99,102,241,0.60))'

/* ── SVG helpers ───────────────────────────────────────────── */

function RectNode({ node, isActive }: { node: PipelineNode; isActive: boolean }) {
  const [cx, cy] = nodeCenter(node)
  const colors = TYPE_COLORS[node.type]
  const x = cx - NODE_W / 2
  const y = cy - NODE_H / 2

  return (
    <g filter={isActive ? ACTIVE_GLOW : undefined}>
      {isActive && (
        <rect
          className="cf-node-active-ring"
          x={x - 4} y={y - 4}
          width={NODE_W + 8} height={NODE_H + 8}
          rx={11} ry={11}
          fill="none"
          stroke="var(--color-indigo-400)"
          strokeWidth={1.5}
        />
      )}
      <rect
        x={x} y={y}
        width={NODE_W} height={NODE_H}
        rx={8} ry={8}
        fill={isActive ? colors.glow ?? colors.bg : colors.bg}
        stroke={isActive ? 'var(--color-indigo-400)' : colors.border}
        strokeWidth={isActive ? 1.5 : 1}
      />
      <text
        x={cx} y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill={colors.text}
        fontSize={11}
        fontWeight={isActive ? 600 : 500}
        fontFamily="Inter, sans-serif"
      >
        {node.label}
      </text>
    </g>
  )
}

function DiamondNode({ node, isActive }: { node: PipelineNode; isActive: boolean }) {
  const [cx, cy] = nodeCenter(node)
  const d = HITL_SIZE / 2
  const colors = TYPE_COLORS.hitl
  const points = `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`

  const ringPoints = `${cx},${cy - d - 4} ${cx + d + 4},${cy} ${cx},${cy + d + 4} ${cx - d - 4},${cy}`

  return (
    <g filter={isActive ? 'drop-shadow(0 0 8px rgba(245,158,11,0.60))' : undefined}>
      {isActive && (
        <polygon className="cf-node-active-ring" points={ringPoints} fill="none" stroke="var(--color-amber-400)" strokeWidth={1.5} />
      )}
      <polygon
        points={points}
        fill={isActive ? 'rgba(245,158,11,0.20)' : colors.bg}
        stroke={isActive ? 'var(--color-amber-400)' : colors.border}
        strokeWidth={isActive ? 1.5 : 1}
      />
      <text
        x={cx} y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fill={colors.text}
        fontSize={9}
        fontWeight={600}
        fontFamily="Inter, sans-serif"
      >
        {node.label}
      </text>
    </g>
  )
}

function EdgeLine({ edge, nodeMap }: { edge: PipelineEdge; nodeMap: Map<string, PipelineNode> }) {
  const from = nodeMap.get(edge.from)
  const to   = nodeMap.get(edge.to)
  if (!from || !to) return null

  const [x1, y1] = nodeCenter(from)
  const [x2, y2] = nodeCenter(to)

  // Simple straight line with slight curve via quadratic bezier
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2

  const isDashed = edge.style === 'dashed'
  const strokeColor = isDashed ? 'var(--color-grey-600)' : 'var(--color-grey-700)'

  return (
    <g>
      <path
        d={`M ${x1} ${y1} Q ${mx} ${y1} ${x2} ${y2}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1}
        strokeDasharray={isDashed ? '4 3' : undefined}
        markerEnd="url(#arrow)"
        opacity={0.6}
      />
      {edge.label && (
        <text
          x={mx} y={(y1 + y2) / 2 - 6}
          textAnchor="middle"
          fill="var(--color-grey-500)"
          fontSize={8}
          fontFamily="Inter, sans-serif"
        >
          {edge.label}
        </text>
      )}
    </g>
  )
}

/* ── Legend ────────────────────────────────────────────────── */

function Legend() {
  const items = [
    { color: TYPE_COLORS.agent.border,    label: 'Agent Run' },
    { color: TYPE_COLORS.hitl.border,     label: 'HITL Gate' },
    { color: TYPE_COLORS.content.border,  label: 'Content Stream' },
    { color: TYPE_COLORS.terminal.border, label: 'Terminal' },
    { color: TYPE_COLORS.error.border,    label: 'Error / Cancel' },
  ]
  return (
    <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', padding: 'var(--space-3) var(--space-4)' }}>
      {items.map(({ color, label }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'block', opacity: 0.8 }} />
          {label}
        </span>
      ))}
    </div>
  )
}

/* ── Main component ────────────────────────────────────────── */

interface PipelineVisualizerProps {
  currentStatus: CourseStatus
  className?: string
}

export function PipelineVisualizer({ currentStatus, className }: PipelineVisualizerProps) {
  const nodeMap = useMemo(() => new Map(NODES.map(n => [n.id, n])), [])

  return (
    <div
      className={className}
      style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-card)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-4) var(--space-6)',
        borderBottom: '1px solid var(--surface-border)',
      }}>
        <div>
          <h3 style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-primary)' }}>
            Your course pipeline
          </h3>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 }}>
            Each stage runs, then waits for your approval · diamonds are your review points
          </p>
        </div>
        <StatusPill status={currentStatus} />
      </div>

      {/* SVG Canvas */}
      <div style={{ overflowX: 'auto', overflowY: 'hidden' }}>
        <svg
          width={CANVAS_W}
          height={CANVAS_H}
          viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          style={{ display: 'block' }}
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--color-grey-600)" />
            </marker>
          </defs>

          {/* Edges — rendered before nodes so nodes sit on top */}
          <g>
            {EDGES.map((edge, i) => (
              <EdgeLine key={i} edge={edge} nodeMap={nodeMap} />
            ))}
          </g>

          {/* Nodes */}
          <g>
            {NODES.map(node => {
              const isActive = node.id === currentStatus
              return node.type === 'hitl' ? (
                <DiamondNode key={node.id} node={node} isActive={isActive} />
              ) : (
                <RectNode key={node.id} node={node} isActive={isActive} />
              )
            })}
          </g>
        </svg>
      </div>

      {/* Legend */}
      <div style={{ borderTop: '1px solid var(--surface-border)' }}>
        <Legend />
      </div>
    </div>
  )
}
