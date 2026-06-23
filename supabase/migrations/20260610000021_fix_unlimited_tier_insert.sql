-- ---------------------------------------------------------------------------
-- 20260610000021_fix_unlimited_tier_insert.sql
--
-- Bug: the courses_insert_own RLS policy enforced the per-tier course limit as
--   (count of own courses) < max_courses
-- but tier_configs uses max_courses = -1 as the "unlimited" sentinel for the
-- pro/enterprise tiers. `count < -1` is ALWAYS false, so paid-tier users could
-- never create a course. (Currently latent — no paid users yet.)
--
-- Fix: treat a negative max_courses as unlimited. Free/starter limits are
-- unchanged (free = 1, starter = 5). A user whose tier can't be resolved
-- (NULL) remains blocked, as before.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "courses_insert_own" ON public.courses;

CREATE POLICY "courses_insert_own" ON public.courses
  FOR INSERT WITH CHECK (
    owner_id = auth.uid()
    AND (
      -- negative max_courses (e.g. -1) = unlimited
      COALESCE((
        SELECT tc.max_courses FROM public.tier_configs tc
        JOIN public.user_profiles up ON up.tier = tc.tier
        WHERE up.id = auth.uid()
      ), 0) < 0
      OR
      -- otherwise enforce the per-tier cap on non-deleted courses
      (
        SELECT COUNT(*) FROM public.courses c2
        WHERE c2.owner_id = auth.uid() AND c2.deleted_at IS NULL
      ) < (
        SELECT tc.max_courses FROM public.tier_configs tc
        JOIN public.user_profiles up ON up.tier = tc.tier
        WHERE up.id = auth.uid()
      )
    )
  );
