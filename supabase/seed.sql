-- =============================================================================
-- CourseForge AI — Seed Data
-- Run after migrations. Safe to re-run (uses ON CONFLICT DO NOTHING).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tier configurations (source of truth for credit caps)
-- ---------------------------------------------------------------------------
INSERT INTO public.tier_configs (tier, ai_credits_cap, max_courses, max_modules_per_course, concurrent_agents, features)
VALUES
  ('free',       50,   2,  5,  1, ARRAY['market_research','architecture','content_generation']),
  ('starter',   200,   5,  7,  1, ARRAY['market_research','architecture','content_generation','sales_page','marketing']),
  ('pro',       1000, 20, 10,  3, ARRAY['market_research','architecture','content_generation','sales_page','marketing','analytics','publishing','parallel_content']),
  ('enterprise',  -1, -1, -1, 10, ARRAY['all','white_label','custom_domain','api_access','sso','priority_support'])
ON CONFLICT (tier) DO UPDATE SET
  ai_credits_cap         = EXCLUDED.ai_credits_cap,
  max_courses            = EXCLUDED.max_courses,
  max_modules_per_course = EXCLUDED.max_modules_per_course,
  concurrent_agents      = EXCLUDED.concurrent_agents,
  features               = EXCLUDED.features,
  updated_at             = NOW();

-- ---------------------------------------------------------------------------
-- Sample market embeddings (real data would be ingested by a scraper service)
-- Vectors are placeholder zeros — replace with real OpenAI embeddings in prod
-- ---------------------------------------------------------------------------
INSERT INTO public.market_embeddings (source_label, content, embedding, niche_tags, expires_at)
VALUES
  (
    'udemy_trend_2026',
    'Top trending course categories on Udemy 2026: AI Automation (avg $89, 45k students), No-Code Tools ($67, 38k), Personal Finance ($49, 92k), Prompt Engineering ($79, 28k). Gap identified: courses on AI Automation for non-technical users have <3 options above 4.5 stars.',
    array_fill(0.0, ARRAY[1536])::extensions.vector,
    ARRAY['ai','automation','no-code','online-courses'],
    NOW() + INTERVAL '90 days'
  ),
  (
    'gumroad_bestsellers_2026',
    'Gumroad bestseller patterns 2026: PDF guides $27-$47 outperform video courses $97+. Creator-story-led products convert 2.3x better than feature-led. Digital downloads with bonus community access see 40% lower refund rates.',
    array_fill(0.0, ARRAY[1536])::extensions.vector,
    ARRAY['gumroad','digital-products','info-products'],
    NOW() + INTERVAL '90 days'
  ),
  (
    'kajabi_market_data_2026',
    'Kajabi market positioning 2026: $497-$997 price points growing 23% YoY. Courses with live cohort components show 67% completion vs 12% for self-paced. Transformation-language headlines (You will be X) outperform feature-language by 31% CTR.',
    array_fill(0.0, ARRAY[1536])::extensions.vector,
    ARRAY['kajabi','high-ticket','coaching','online-education'],
    NOW() + INTERVAL '90 days'
  ),
  (
    'reddit_signals_2026',
    'r/learnprogramming, r/Entrepreneur pain points 2026: "I watch tutorials but can't build anything" (17k upvotes), "Too many courses, none have real projects", "Need accountability not just content". Strong demand signal for project-based and accountability-first course formats.',
    array_fill(0.0, ARRAY[1536])::extensions.vector,
    ARRAY['programming','entrepreneur','learning','pain-points'],
    NOW() + INTERVAL '30 days'
  ),
  (
    'google_trends_ai_2026',
    'Google Trends 2026 rising queries: "AI tools for small business" (+340%), "automate with AI no code" (+280%), "build SaaS with AI" (+190%), "ChatGPT for marketing" (+155%). Long-tail opportunity: AI automation for specific verticals (real estate, legal, healthcare).',
    array_fill(0.0, ARRAY[1536])::extensions.vector,
    ARRAY['ai','trends','seo','keywords'],
    NOW() + INTERVAL '30 days'
  )
ON CONFLICT DO NOTHING;
