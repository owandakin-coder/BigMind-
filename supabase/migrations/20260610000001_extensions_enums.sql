-- =============================================================================
-- Migration 0001: Extensions & Enums
-- CourseForge AI — Production Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector        WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_trgm"     WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pg_cron"     WITH SCHEMA extensions;  -- for analytics cron job

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
CREATE TYPE public.course_status AS ENUM (
  'draft',
  'market_research',
  'market_review',
  'market_rejected',
  'market_pivot',
  'architecture_design',
  'architecture_review',
  'architecture_rejected',
  'content_generation',
  'content_review',
  'sales_page_generation',
  'sales_page_review',
  'marketing_prep',
  'marketing_review',
  'final_approval_gate',
  'publishing',
  'live',
  'live_analytics',
  'paused',
  'archived',
  'failed'
);

CREATE TYPE public.agent_name AS ENUM (
  'market_research_agent',
  'course_architect_agent',
  'content_production_agent',
  'sales_page_agent',
  'marketing_agent',
  'analytics_agent',
  'publishing_agent'
);

CREATE TYPE public.approval_action AS ENUM (
  'approve',
  'reject',
  'regenerate',
  'pivot',
  'approve_and_lock'
);

CREATE TYPE public.asset_type AS ENUM (
  'lesson_script',
  'workbook',
  'slide_outline',
  'quiz_json',
  'video_script',
  'image_prompt',
  'generated_image',
  'sales_copy',
  'email_sequence',
  'social_post',
  'thumbnail'
);

CREATE TYPE public.asset_source_type AS ENUM (
  'course',
  'module',
  'lesson'
);

CREATE TYPE public.platform_target AS ENUM (
  'udemy',
  'gumroad',
  'kajabi',
  'teachable',
  'maven',
  'internal'
);

CREATE TYPE public.subscription_tier AS ENUM (
  'free',
  'starter',
  'pro',
  'enterprise'
);

CREATE TYPE public.content_format AS ENUM (
  'written',
  'visual',
  'interactive'
);
