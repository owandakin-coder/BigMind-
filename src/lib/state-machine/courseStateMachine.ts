// =============================================================================
// CourseForge AI — State Machine Definition (TypeScript)
// This MUST be kept in sync with the PostgreSQL course_status ENUM and
// validate_state_transition() function in Supabase migrations.
// =============================================================================

// ---------------------------------------------------------------------------
// Enum — matches PostgreSQL course_status ENUM exactly (25 values total)
// ---------------------------------------------------------------------------
export enum CourseStatus {
  DRAFT                   = 'draft',
  MARKET_RESEARCH         = 'market_research',
  MARKET_REVIEW           = 'market_review',
  MARKET_REJECTED         = 'market_rejected',
  MARKET_PIVOT            = 'market_pivot',
  ARCHITECTURE_DESIGN     = 'architecture_design',
  ARCHITECTURE_REVIEW     = 'architecture_review',
  ARCHITECTURE_REJECTED   = 'architecture_rejected',
  CONTENT_GENERATION      = 'content_generation',
  CONTENT_REVIEW          = 'content_review',
  SALES_PAGE_GENERATION   = 'sales_page_generation',
  SALES_PAGE_REVIEW       = 'sales_page_review',
  MARKETING_PREP          = 'marketing_prep',
  MARKETING_REVIEW        = 'marketing_review',
  FINAL_APPROVAL_GATE     = 'final_approval_gate',
  PUBLISHING              = 'publishing',
  LIVE                    = 'live',
  LIVE_ANALYTICS          = 'live_analytics',
  PAUSED                  = 'paused',
  ARCHIVED                = 'archived',
  FAILED                  = 'failed',
  // Extended auxiliary post-publish states (migration 0010)
  PORTFOLIO_SYNC          = 'portfolio_sync',
  REVENUE_ANALYSIS        = 'revenue_analysis',
  SEO_OPTIMIZATION        = 'seo_optimization',
  CUSTOMER_SUCCESS_ACTIVE = 'customer_success_active',
}

// ---------------------------------------------------------------------------
// Transition map — mirrors PostgreSQL validate_state_transition()
// ---------------------------------------------------------------------------
export const VALID_TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
  [CourseStatus.DRAFT]:                   [CourseStatus.MARKET_RESEARCH],
  [CourseStatus.MARKET_RESEARCH]:         [CourseStatus.MARKET_REVIEW, CourseStatus.FAILED],
  [CourseStatus.MARKET_REVIEW]:           [CourseStatus.MARKET_REJECTED, CourseStatus.ARCHITECTURE_DESIGN],
  [CourseStatus.MARKET_REJECTED]:         [CourseStatus.MARKET_PIVOT, CourseStatus.DRAFT],
  [CourseStatus.MARKET_PIVOT]:            [CourseStatus.MARKET_REVIEW],
  [CourseStatus.ARCHITECTURE_DESIGN]:     [CourseStatus.ARCHITECTURE_REVIEW, CourseStatus.FAILED],
  [CourseStatus.ARCHITECTURE_REVIEW]:     [CourseStatus.ARCHITECTURE_REJECTED, CourseStatus.CONTENT_GENERATION],
  [CourseStatus.ARCHITECTURE_REJECTED]:   [CourseStatus.ARCHITECTURE_DESIGN],
  [CourseStatus.CONTENT_GENERATION]:      [CourseStatus.CONTENT_REVIEW, CourseStatus.SALES_PAGE_GENERATION, CourseStatus.FAILED],
  [CourseStatus.CONTENT_REVIEW]:          [CourseStatus.CONTENT_GENERATION, CourseStatus.SALES_PAGE_GENERATION],
  [CourseStatus.SALES_PAGE_GENERATION]:   [CourseStatus.SALES_PAGE_REVIEW, CourseStatus.FAILED],
  [CourseStatus.SALES_PAGE_REVIEW]:       [CourseStatus.SALES_PAGE_GENERATION, CourseStatus.MARKETING_PREP],
  [CourseStatus.MARKETING_PREP]:          [CourseStatus.MARKETING_REVIEW, CourseStatus.FAILED],
  [CourseStatus.MARKETING_REVIEW]:        [CourseStatus.MARKETING_PREP, CourseStatus.FINAL_APPROVAL_GATE],
  [CourseStatus.FINAL_APPROVAL_GATE]: [
    CourseStatus.PUBLISHING,
    CourseStatus.CONTENT_GENERATION,
    CourseStatus.SALES_PAGE_GENERATION,
    CourseStatus.MARKETING_PREP,
  ],
  [CourseStatus.PUBLISHING]:              [CourseStatus.LIVE, CourseStatus.FAILED],
  [CourseStatus.LIVE]:                    [CourseStatus.LIVE_ANALYTICS, CourseStatus.PAUSED],
  [CourseStatus.LIVE_ANALYTICS]:          [CourseStatus.LIVE, CourseStatus.PAUSED, CourseStatus.CONTENT_GENERATION],
  [CourseStatus.PAUSED]:                  [CourseStatus.LIVE, CourseStatus.ARCHIVED],
  [CourseStatus.ARCHIVED]:               [CourseStatus.DRAFT],
  [CourseStatus.FAILED]:                  [CourseStatus.DRAFT],
  [CourseStatus.PORTFOLIO_SYNC]:          [CourseStatus.REVENUE_ANALYSIS, CourseStatus.FAILED],
  [CourseStatus.REVENUE_ANALYSIS]:        [CourseStatus.SEO_OPTIMIZATION, CourseStatus.FAILED],
  [CourseStatus.SEO_OPTIMIZATION]:        [CourseStatus.CUSTOMER_SUCCESS_ACTIVE, CourseStatus.FAILED],
  [CourseStatus.CUSTOMER_SUCCESS_ACTIVE]: [CourseStatus.PORTFOLIO_SYNC],
};

// ---------------------------------------------------------------------------
// State metadata — drives frontend DAG visualization
// ---------------------------------------------------------------------------
export interface StateMetadata {
  label: string;
  phase: 'build' | 'review' | 'live' | 'terminal';
  isHITLGate: boolean;
  isAgentRun: boolean;
  dagColor: 'gray' | 'blue' | 'amber' | 'green' | 'red';
  description: string;
  agentResponsible?: string;
  estimatedDurationMs?: number;
}

export const STATE_METADATA: Record<CourseStatus, StateMetadata> = {
  [CourseStatus.DRAFT]: {
    label: 'Draft', phase: 'build', isHITLGate: false, isAgentRun: false,
    dagColor: 'gray', description: 'Course idea submitted, awaiting launch.',
  },
  [CourseStatus.MARKET_RESEARCH]: {
    label: 'Market Research', phase: 'build', isHITLGate: false, isAgentRun: true,
    dagColor: 'blue', description: 'Market Research Agent analyzing demand, competition, and pricing.',
    agentResponsible: 'market_research_agent', estimatedDurationMs: 45000,
  },
  [CourseStatus.MARKET_REVIEW]: {
    label: 'Awaiting Market Approval', phase: 'review', isHITLGate: true, isAgentRun: false,
    dagColor: 'amber', description: 'Human review of Market Research Report and Risk Matrix.',
  },
  [CourseStatus.MARKET_REJECTED]: {
    label: 'Market Report Rejected', phase: 'review', isHITLGate: false, isAgentRun: false,
    dagColor: 'red', description: 'Market report rejected. Pivot or restart.',
  },
  [CourseStatus.MARKET_PIVOT]: {
    label: 'Pivot Analysis', phase: 'build', isHITLGate: false, isAgentRun: true,
    dagColor: 'blue', description: 'Market Agent generating adjacent niche recommendations.',
    agentResponsible: 'market_research_agent', estimatedDurationMs: 30000,
  },
  [CourseStatus.ARCHITECTURE_DESIGN]: {
    label: 'Designing Course Structure', phase: 'build', isHITLGate: false, isAgentRun: true,
    dagColor: 'blue', description: 'Architect Agent building C.O.R.E. syllabus.',
    agentResponsible: 'course_architect_agent', estimatedDurationMs: 60000,
  },
  [CourseStatus.ARCHITECTURE_REVIEW]: {
    label: 'Awaiting Syllabus Approval', phase: 'review', isHITLGate: true, isAgentRun: false,
    dagColor: 'amber', description: 'Human review of course blueprint and learning outcomes.',
  },
  [CourseStatus.ARCHITECTURE_REJECTED]: {
    label: 'Syllabus Rejected', phase: 'review', isHITLGate: false, isAgentRun: false,
    dagColor: 'red', description: 'Blueprint rejected. Architect Agent will revise.',
  },
  [CourseStatus.CONTENT_GENERATION]: {
    label: 'Generating Content (MVC First)', phase: 'build', isHITLGate: false, isAgentRun: true,
    dagColor: 'blue', description: 'Content Agent generating scripts, visuals, and quizzes in parallel.',
    agentResponsible: 'content_production_agent', estimatedDurationMs: 120000,
  },
  [CourseStatus.CONTENT_REVIEW]: {
    label: 'Content Spot Check', phase: 'review', isHITLGate: false, isAgentRun: false,
    dagColor: 'amber', description: 'Optional review gate for MVC content. Auto-approvable.',
  },
  [CourseStatus.SALES_PAGE_GENERATION]: {
    label: 'Writing Sales Copy', phase: 'build', isHITLGate: false, isAgentRun: true,
    dagColor: 'blue', description: 'Sales Page Agent generating platform-specific copy.',
    agentResponsible: 'sales_page_agent', estimatedDurationMs: 40000,
  },
  [CourseStatus.SALES_PAGE_REVIEW]: {
    label: 'Review Sales Page', phase: 'review', isHITLGate: true, isAgentRun: false,
    dagColor: 'amber', description: 'Human review of sales copy and headline A/B variants.',
  },
  [CourseStatus.MARKETING_PREP]: {
    label: 'Building Launch Campaign', phase: 'build', isHITLGate: false, isAgentRun: true,
    dagColor: 'blue', description: 'Marketing Agent building 30-day launch sequence.',
    agentResponsible: 'marketing_agent', estimatedDurationMs: 50000,
  },
  [CourseStatus.MARKETING_REVIEW]: {
    label: 'Review Launch Campaign', phase: 'review', isHITLGate: false, isAgentRun: false,
    dagColor: 'amber', description: 'Human review of 30-day launch sequence.',
  },
  [CourseStatus.FINAL_APPROVAL_GATE]: {
    label: 'Final Approval Gate', phase: 'review', isHITLGate: true, isAgentRun: false,
    dagColor: 'amber', description: 'CRITICAL: Aggregated review of MVC, Sales Page, and Marketing Plan.',
  },
  [CourseStatus.PUBLISHING]: {
    label: 'Publishing', phase: 'build', isHITLGate: false, isAgentRun: true,
    dagColor: 'blue', description: 'Publishing Agent dry-run validation and platform API submission.',
    agentResponsible: 'publishing_agent', estimatedDurationMs: 30000,
  },
  [CourseStatus.LIVE]: {
    label: 'Live', phase: 'live', isHITLGate: false, isAgentRun: false,
    dagColor: 'green', description: 'Course is published and receiving traffic.',
  },
  [CourseStatus.LIVE_ANALYTICS]: {
    label: 'Optimizing', phase: 'live', isHITLGate: false, isAgentRun: true,
    dagColor: 'green', description: 'Analytics Agent monitoring metrics and triggering optimization tasks.',
    agentResponsible: 'analytics_agent',
  },
  [CourseStatus.PAUSED]: {
    label: 'Paused', phase: 'terminal', isHITLGate: false, isAgentRun: false,
    dagColor: 'gray', description: 'Course manually paused.',
  },
  [CourseStatus.ARCHIVED]: {
    label: 'Archived', phase: 'terminal', isHITLGate: false, isAgentRun: false,
    dagColor: 'gray', description: 'Course archived. Can be restarted from Draft.',
  },
  [CourseStatus.FAILED]: {
    label: 'Failed', phase: 'terminal', isHITLGate: false, isAgentRun: false,
    dagColor: 'red', description: 'Agent error. Review logs and retry from Draft.',
  },
  [CourseStatus.PORTFOLIO_SYNC]: {
    label: 'Portfolio Sync', phase: 'live', isHITLGate: false, isAgentRun: true,
    dagColor: 'green', description: 'Portfolio Manager analyzing BCG matrix and cross-sell opportunities.',
    agentResponsible: 'portfolio_manager_agent', estimatedDurationMs: 45000,
  },
  [CourseStatus.REVENUE_ANALYSIS]: {
    label: 'Revenue Intelligence', phase: 'live', isHITLGate: false, isAgentRun: true,
    dagColor: 'green', description: 'Revenue Intelligence Agent running cohort LTV and churn prediction.',
    agentResponsible: 'revenue_intelligence_agent', estimatedDurationMs: 60000,
  },
  [CourseStatus.SEO_OPTIMIZATION]: {
    label: 'SEO Optimization', phase: 'live', isHITLGate: false, isAgentRun: true,
    dagColor: 'green', description: 'SEO Agent running keyword optimization and schema markup.',
    agentResponsible: 'seo_agent', estimatedDurationMs: 40000,
  },
  [CourseStatus.CUSTOMER_SUCCESS_ACTIVE]: {
    label: 'Customer Success Active', phase: 'live', isHITLGate: false, isAgentRun: true,
    dagColor: 'green', description: 'Customer Success Agent monitoring at-risk segments.',
    agentResponsible: 'customer_success_agent', estimatedDurationMs: 50000,
  },
};

// ---------------------------------------------------------------------------
// Transition guard — client-side validation (mirrors server RPC)
// ---------------------------------------------------------------------------
export function canTransition(from: CourseStatus, to: CourseStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// WorkflowTransitionEvent
// ---------------------------------------------------------------------------
export interface WorkflowTransitionEvent {
  eventId: string;
  courseId: string;
  fromStatus: CourseStatus;
  toStatus: CourseStatus;
  triggeredBy: 'human' | 'agent' | 'system';
  actorId: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
export interface RiskMatrixEntry {
  risk: string;
  severity: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface PivotOption {
  subNiche: string;
  demandScore: number;
  rationale: string;
}

export interface CompetitorEntry {
  platform: string;
  title: string;
  price: number;
  rating: number;
  students: number;
  gaps: string[];
}

export interface PricingAnalysis {
  suggestedPrice: number;
  priceFloor: number;
  priceCeiling: number;
  rationale: string;
}

export interface MarketResearchDocument {
  id: string;
  courseId: string;
  version: number;
  demandScore: number;
  opportunityScore: number;
  competitionScore: number;
  competitorAnalysis: CompetitorEntry[];
  pricingAnalysis: PricingAnalysis;
  seoKeywords: string[];
  riskMatrix: RiskMatrixEntry[];
  pivotOptions: PivotOption[];
  pivotTriggered: boolean;
}

export interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  text: string;
  type: 'single' | 'multiple' | 'true_false';
  options: QuizOption[];
  explanation: string;
}

export interface QuizJSON {
  questions: QuizQuestion[];
}

export interface CORELesson {
  lessonId?: string;
  title: string;
  context: string;
  observation: string;
  reflection: string;
  evaluation: QuizJSON;
  painPointRef: string;
  estimatedMinutes: number;
}

export interface CourseModule {
  moduleIndex: number;
  title: string;
  description: string;
  painPointRef: string;
  isMVC: boolean;
  lessons: CORELesson[];
}

export interface CourseBlueprint {
  id: string;
  courseId: string;
  marketReportId: string;
  learningOutcomes: string[];
  totalModules: number;
  totalLessons: number;
  estimatedHours: number;
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  modules: CourseModule[];
}

export interface ModuleContentPackage {
  moduleIndex: number;
  written: {
    lessonScript: string;
    workbook: string;
  };
  visual: {
    imagePrompts: string[];
    slideOutline: string[];
  };
  interactive: {
    quizzes: QuizJSON[];
  };
}

export interface PlatformSalesCopy {
  platform: string;
  headlines: { variant: 'A' | 'B'; text: string }[];
  subheadline: string;
  painAgitateSection: string;
  moduleBreakdown: string;
  valueStack: string;
  cta: string;
  seoMeta: { title: string; description: string; keywords: string[] };
}

export interface LaunchPost {
  platform: string;
  postType: 'thread' | 'carousel_outline' | 'short_video_script' | 'newsletter_intro';
  content: string;
  scheduledAt: string;
  hashtags: string[];
}

export interface ThirtyDayLaunchSequence {
  courseId: string;
  startDate: string;
  posts: LaunchPost[];
}

export const ANALYTICS_THRESHOLDS = {
  MODULE_DROPOFF_CRITICAL: 0.60,
  SALES_CONVERSION_GOOD:   0.05,
  REFUND_RATE_WARNING:     0.10,
  QUIZ_FAIL_RATE_WARNING:  0.50,
} as const;

export interface AnalyticsTriggerTask {
  triggerType: 'redesign' | 'content_gap' | 'simplify' | 'harmonize';
  targetAgent: string;
  targetEntityId: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  metric: string;
  metricValue: number;
  threshold: number;
}
