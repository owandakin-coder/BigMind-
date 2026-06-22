-- Migration 0015: Seed tier_configs
-- Required for user signup trigger: fn_create_user_profile inserts tier='free'
-- which FK-references tier_configs(tier).

INSERT INTO public.tier_configs
  (tier, ai_credits_cap, max_courses, max_modules_per_course, concurrent_agents, features)
VALUES
  ('free',       50,   1,  5, 1, ARRAY['1 course', '50 AI credits/mo', 'Community support']),
  ('starter',   500,   5,  7, 2, ARRAY['5 courses', '500 AI credits/mo', 'Email support', 'All exports']),
  ('pro',       2000, -1, 12, 5, ARRAY['Unlimited courses', '2000 AI credits/mo', 'Priority support', 'Analytics']),
  ('enterprise', -1,  -1, -1, -1, ARRAY['Unlimited everything', 'Dedicated support', 'White-label', 'API access'])
ON CONFLICT (tier) DO UPDATE
  SET ai_credits_cap         = EXCLUDED.ai_credits_cap,
      max_courses             = EXCLUDED.max_courses,
      max_modules_per_course  = EXCLUDED.max_modules_per_course,
      concurrent_agents       = EXCLUDED.concurrent_agents,
      features                = EXCLUDED.features;
