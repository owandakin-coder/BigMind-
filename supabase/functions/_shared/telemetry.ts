/**
 * telemetry.ts — Structured telemetry emitter for agent execution.
 *
 * Emits span events to Supabase analytics_events table and optionally
 * to an external observability endpoint (e.g., Axiom, Grafana).
 *
 * Each agent run generates:
 *  - span_start: when the agent begins execution
 *  - span_end: when the agent completes (success or failure)
 *  - custom events: validation failures, retries, fallback activations
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0'

export type TelemetryEventType =
  | 'agent.span_start'
  | 'agent.span_end'
  | 'agent.retry'
  | 'agent.fallback_activated'
  | 'agent.validation_failed'
  | 'agent.validation_passed'
  | 'agent.budget_check'
  | 'agent.db_write'
  | 'agent.approval_created'
  | 'agent.status_transitioned'
  | 'agent.error'

export interface TelemetryEvent {
  event_type:   TelemetryEventType
  course_id:    string
  agent_name:   string
  span_id:      string
  duration_ms?: number
  metadata:     Record<string, unknown>
  timestamp:    string
}

export class TelemetryCollector {
  private readonly spanId: string
  private readonly startTime: number
  private readonly courseId: string
  private readonly agentName: string
  private readonly serviceClient: SupabaseClient
  private events: TelemetryEvent[] = []

  constructor(
    courseId:      string,
    agentName:     string,
    serviceClient: SupabaseClient
  ) {
    this.courseId      = courseId
    this.agentName     = agentName
    this.serviceClient = serviceClient
    this.spanId        = crypto.randomUUID()
    this.startTime     = Date.now()
  }

  private emit(type: TelemetryEventType, metadata: Record<string, unknown> = {}): void {
    const event: TelemetryEvent = {
      event_type: type,
      course_id:  this.courseId,
      agent_name: this.agentName,
      span_id:    this.spanId,
      duration_ms: type.includes('end') || type.includes('error')
        ? Date.now() - this.startTime
        : undefined,
      metadata,
      timestamp: new Date().toISOString(),
    }
    this.events.push(event)
    // Fire-and-forget to Supabase
    this.persistEvent(event).catch(err =>
      console.warn('[Telemetry] Failed to persist event:', err)
    )
  }

  private async persistEvent(event: TelemetryEvent): Promise<void> {
    await this.serviceClient
      .from('analytics_events')
      .insert({
        course_id:   event.course_id,
        event_type:  event.event_type,
        event_value: event.duration_ms ?? 0,
        metadata:    { ...event.metadata, span_id: event.span_id, agent: event.agent_name },
      })
  }

  spanStart(metadata?: Record<string, unknown>): void {
    this.emit('agent.span_start', metadata)
  }

  spanEnd(metadata?: Record<string, unknown>): void {
    this.emit('agent.span_end', {
      ...metadata,
      total_duration_ms: Date.now() - this.startTime,
    })
  }

  retry(attempt: number, error: string): void {
    this.emit('agent.retry', { attempt, error })
  }

  fallbackActivated(reason: string): void {
    this.emit('agent.fallback_activated', { reason })
  }

  validationFailed(errors: string[]): void {
    this.emit('agent.validation_failed', { errors })
  }

  validationPassed(schema: string): void {
    this.emit('agent.validation_passed', { schema })
  }

  budgetCheck(estimated: number, ceiling: number, passed: boolean): void {
    this.emit('agent.budget_check', { estimated, ceiling, passed })
  }

  dbWrite(table: string, rowCount: number): void {
    this.emit('agent.db_write', { table, row_count: rowCount })
  }

  approvalCreated(approvalId: string, gateName: string): void {
    this.emit('agent.approval_created', { approval_id: approvalId, gate_name: gateName })
  }

  statusTransitioned(from: string, to: string): void {
    this.emit('agent.status_transitioned', { from, to })
  }

  error(code: string, message: string, retryable: boolean): void {
    this.emit('agent.error', { code, message, retryable })
  }

  getSpanId(): string { return this.spanId }
  getElapsedMs(): number { return Date.now() - this.startTime }
  getEvents(): TelemetryEvent[] { return [...this.events] }
}
