// database.types.ts — Generated-style types matching the Supabase schema exactly
// Keep in sync with supabase/migrations/

export type CourseStatus =
  | 'draft' | 'market_research' | 'market_review' | 'market_rejected' | 'market_pivot'
  | 'architecture_design' | 'architecture_review' | 'architecture_rejected'
  | 'content_generation' | 'content_review'
  | 'sales_page_generation' | 'sales_page_review'
  | 'marketing_prep' | 'marketing_review'
  | 'final_approval_gate' | 'publishing'
  | 'live' | 'live_analytics' | 'paused' | 'archived' | 'failed'

export type AgentName =
  | 'market_research_agent' | 'course_architect_agent' | 'content_production_agent'
  | 'sales_page_agent' | 'marketing_agent' | 'analytics_agent' | 'publishing_agent'

export type ApprovalAction  = 'approve' | 'reject' | 'regenerate' | 'pivot' | 'approve_and_lock'
export type AssetType       = 'lesson_script' | 'workbook' | 'slide_outline' | 'quiz_json'
  | 'video_script' | 'image_prompt' | 'generated_image' | 'sales_copy'
  | 'email_sequence' | 'social_post' | 'thumbnail'
export type AssetSourceType = 'course' | 'module' | 'lesson'
export type PlatformTarget  = 'udemy' | 'gumroad' | 'kajabi' | 'teachable' | 'maven' | 'internal'
export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'enterprise'
export type ContentFormat   = 'written' | 'visual' | 'interactive'

// ─── Table Row Types ──────────────────────────────────────────────────────────

export interface TierConfig {
  tier:                     SubscriptionTier
  ai_credits_cap:           number  // -1 = unlimited
  max_courses:              number
  max_modules_per_course:   number
  concurrent_agents:        number
  features:                 string[]
  created_at:               string
  updated_at:               string
}

export interface UserProfile {
  id:                   string
  display_name:         string
  avatar_url:           string | null
  tier:                 SubscriptionTier
  ai_credits_used:      number
  billing_cycle_start:  string
  onboarding_completed: boolean
  metadata:             Record<string, unknown>
  created_at:           string
  updated_at:           string
  deleted_at:           string | null
}

export interface Course {
  id:                   string
  owner_id:             string
  title:                string
  slug:                 string | null
  course_idea:          string
  target_niche:         string
  creator_goals:        string | null
  status:               CourseStatus
  platform_target:      PlatformTarget
  current_version:      number
  parallel_content_gen: boolean
  auto_approve_content: boolean
  market_report_locked: boolean
  blueprint_locked:     boolean
  sales_copy_locked:    boolean
  price_usd:            number | null
  published_at:         string | null
  created_at:           string
  updated_at:           string
  deleted_at:           string | null
}

export interface CourseIteration {
  id:             string
  course_id:      string
  version:        number
  snapshot_json:  Record<string, unknown>
  change_summary: string | null
  triggered_by:   string
  created_at:     string
  updated_at:     string
  deleted_at:     string | null
}

export interface MarketResearchDocument {
  id:                   string
  course_id:            string
  version:              number
  demand_score:         number | null
  opportunity_score:    number | null
  competition_score:    number | null
  competitor_analysis:  CompetitorEntry[]
  pricing_analysis:     PricingAnalysis
  seo_keywords:         string[]
  risk_matrix:          RiskMatrixEntry[]
  pivot_options:        PivotOption[]
  pivot_triggered:      boolean
  rag_context_ids:      string[]
  agent_version:        string
  generation_ms:        number | null
  raw_llm_output:       string | null
  is_active:            boolean
  created_at:           string
  updated_at:           string
  deleted_at:           string | null
}

export interface CompetitorEntry { platform: string; title: string; price: number; rating: number; students: number; gaps: string[] }
export interface PricingAnalysis { suggested_price: number; price_floor: number; price_ceiling: number; rationale: string }
export interface RiskMatrixEntry { risk: string; severity: 'low' | 'medium' | 'high'; mitigation: string }
export interface PivotOption     { sub_niche: string; demand_score: number; rationale: string }

export interface CourseBlueprint {
  id:                string
  course_id:         string
  market_report_id:  string
  version:           number
  learning_outcomes: string[]
  total_modules:     number
  total_lessons:     number
  estimated_hours:   number | null
  difficulty_level:  'beginner' | 'intermediate' | 'advanced' | null
  core_framework:    CoreFrameworkEntry[]
  is_active:         boolean
  created_at:        string
  updated_at:        string
  deleted_at:        string | null
}

export interface CoreFrameworkEntry { module_index: number; context: string; observation: string; reflection: string }

export interface Module {
  id:             string
  course_id:      string
  blueprint_id:   string | null
  title:          string
  description:    string | null
  sort_order:     number
  pain_point_ref: string | null
  is_mvc:         boolean
  status:         'draft' | 'generating' | 'review' | 'approved' | 'published'
  created_at:     string
  updated_at:     string
  deleted_at:     string | null
}

export interface Lesson {
  id:                       string
  module_id:                string
  course_id:                string
  title:                    string
  sort_order:               number
  context_hook:             string | null
  observation_concept:      string | null
  reflection_exercise:      string | null
  evaluation_quiz_asset_id: string | null
  estimated_minutes:        number
  created_at:               string
  updated_at:               string
  deleted_at:               string | null
}

export interface DigitalAsset {
  id:              string
  source_type:     AssetSourceType
  source_id:       string
  asset_type:      AssetType
  content_format:  ContentFormat | null
  title:           string | null
  content_text:    string | null
  content_url:     string | null
  content_json:    unknown | null
  mime_type:       string | null
  file_size_bytes: number | null
  storage_path:    string | null
  version:         number
  is_locked:       boolean
  is_active:       boolean
  platform_target: PlatformTarget | null
  ab_variant:      'A' | 'B' | null
  generated_by:    AgentName | null
  generation_ms:   number | null
  created_at:      string
  updated_at:      string
  deleted_at:      string | null
}

export interface Approval {
  id:             string
  course_id:      string
  approval_stage: string
  target_type:    'market_report' | 'blueprint' | 'module' | 'sales_copy' | 'full_course'
  target_id:      string
  reviewer_id:    string | null
  action:         ApprovalAction | null
  feedback:       string | null
  requested_at:   string
  reviewed_at:    string | null
  is_pending:     boolean  // generated column: action IS NULL
  created_at:     string
  updated_at:     string
  deleted_at:     string | null
}

export interface AgentLog {
  id:                string
  course_id:         string
  agent:             AgentName
  event_type:        string
  from_status:       CourseStatus | null
  to_status:         CourseStatus | null
  reasoning_trace:   ReasoningStep[]
  model_used:        string | null
  prompt_tokens:     number | null
  completion_tokens: number | null
  total_cost_usd:    number | null
  error_code:        string | null
  error_message:     string | null
  actor_id:          string
  created_at:        string
}

export interface ReasoningStep { step: number; decision: string; rationale: string; timestamp: string }

export interface AnalyticsEvent {
  id:           string
  course_id:    string
  module_id:    string | null
  lesson_id:    string | null
  metric_name:  string
  metric_value: number
  sample_count: number
  window_date:  string
  trigger_fired: boolean
  trigger_type: string | null
  created_at:   string
  updated_at:   string
}

export interface AnalyticsTask {
  id:                string
  course_id:         string
  trigger_type:      'redesign' | 'content_gap' | 'simplify' | 'harmonize'
  target_agent:      AgentName
  target_entity_id:  string | null
  message:           string
  priority:          'high' | 'medium' | 'low'
  metric_name:       string
  metric_value:      number
  threshold:         number
  dismissed:         boolean
  dismissed_by:      string | null
  dismissed_at:      string | null
  resolved:          boolean
  resolved_at:       string | null
  created_at:        string
  updated_at:        string
}

export interface PlatformPublishLog {
  id:                  string
  course_id:           string
  platform:            PlatformTarget
  status:              'dry_run' | 'pending' | 'success' | 'failed'
  platform_course_id:  string | null
  platform_url:        string | null
  dry_run_report:      Record<string, unknown> | null
  error_detail:        string | null
  published_at:        string | null
  created_at:          string
  updated_at:          string
}

// ─── RPC Return Types ─────────────────────────────────────────────────────────
export interface CourseDashboard {
  course:            Course
  pending_approval:  Approval | null
  last_agent_event:  AgentLog | null
  credits:           { ai_credits_used: number; ai_credits_cap: number; usage_pct: number | null }
  open_tasks:        number
}

export interface AuditTrailEntry {
  log_id:          string
  event_type:      string
  agent:           string
  from_status:     string | null
  to_status:       string | null
  reasoning_trace: ReasoningStep[]
  model_used:      string | null
  total_cost_usd:  number | null
  actor_display:   string
  created_at:      string
}

export interface PendingApproval {
  approval_id:    string
  approval_stage: string
  target_type:    string
  target_id:      string
  requested_at:   string
  course_status:  CourseStatus
}

// ─── Supabase Database type (for createClient generic) ───────────────────────
export interface Database {
  public: {
    Tables: {
      tier_configs:               { Row: TierConfig;               Insert: Partial<TierConfig>;               Update: Partial<TierConfig>               }
      user_profiles:              { Row: UserProfile;              Insert: Partial<UserProfile>;              Update: Partial<UserProfile>              }
      courses:                    { Row: Course;                   Insert: Omit<Course, 'id'|'created_at'|'updated_at'|'slug'>; Update: Partial<Course> }
      course_iterations:          { Row: CourseIteration;          Insert: Omit<CourseIteration,'id'|'created_at'|'updated_at'>; Update: Partial<CourseIteration> }
      market_research_documents:  { Row: MarketResearchDocument;   Insert: Omit<MarketResearchDocument,'id'|'created_at'|'updated_at'>; Update: Partial<MarketResearchDocument> }
      course_blueprints:          { Row: CourseBlueprint;          Insert: Omit<CourseBlueprint,'id'|'created_at'|'updated_at'>; Update: Partial<CourseBlueprint> }
      modules:                    { Row: Module;                   Insert: Omit<Module,'id'|'created_at'|'updated_at'>; Update: Partial<Module> }
      lessons:                    { Row: Lesson;                   Insert: Omit<Lesson,'id'|'created_at'|'updated_at'>; Update: Partial<Lesson> }
      digital_assets:             { Row: DigitalAsset;             Insert: Omit<DigitalAsset,'id'|'created_at'|'updated_at'>; Update: Partial<DigitalAsset> }
      approvals:                  { Row: Approval;                 Insert: Omit<Approval,'id'|'created_at'|'updated_at'|'is_pending'>; Update: Partial<Approval> }
      agent_logs:                 { Row: AgentLog;                 Insert: Omit<AgentLog,'id'|'created_at'>; Update: never }
      analytics_events:           { Row: AnalyticsEvent;           Insert: Omit<AnalyticsEvent,'id'|'created_at'|'updated_at'>; Update: Partial<AnalyticsEvent> }
      analytics_tasks:            { Row: AnalyticsTask;            Insert: Omit<AnalyticsTask,'id'|'created_at'|'updated_at'>; Update: Partial<AnalyticsTask> }
      platform_publish_logs:      { Row: PlatformPublishLog;       Insert: Omit<PlatformPublishLog,'id'|'created_at'|'updated_at'>; Update: Partial<PlatformPublishLog> }
    }
    Functions: {
      perform_approval_action:    { Args: { p_approval_id: string; p_action: ApprovalAction; p_feedback?: string }; Returns: { success: boolean; approval_id: string; action: string; new_status: CourseStatus; locked: boolean } }
      check_and_deduct_credits:   { Args: { p_user_id: string; p_cost_units: number }; Returns: boolean }
      match_market_embeddings:    { Args: { query_embedding: number[]; match_threshold: number; match_count: number; filter_niche?: string }; Returns: Array<{ id: string; source_label: string; content: string; niche_tags: string[]; similarity: number; scraped_at: string }> }
      upsert_analytics_metric:    { Args: { p_course_id: string; p_module_id: string | null; p_lesson_id: string | null; p_metric_name: string; p_value: number; p_count?: number; p_date?: string }; Returns: string }
      get_pending_approvals:      { Args: { p_course_id: string }; Returns: PendingApproval[] }
      get_audit_trail:            { Args: { p_course_id: string }; Returns: AuditTrailEntry[] }
      get_course_dashboard:       { Args: { p_course_id: string }; Returns: CourseDashboard }
      transition_course_status:   { Args: { p_course_id: string; p_new_status: CourseStatus; p_actor_id: string; p_metadata?: string }; Returns: CourseStatus }
      launch_course_workflow:     { Args: { p_course_id: string }; Returns: { success: boolean; new_status: CourseStatus } }
      snapshot_course_version:    { Args: { p_course_id: string; p_actor_id?: string }; Returns: string }
      dismiss_analytics_task:     { Args: { p_task_id: string; p_reason?: string }; Returns: boolean }
    }
  }
}
