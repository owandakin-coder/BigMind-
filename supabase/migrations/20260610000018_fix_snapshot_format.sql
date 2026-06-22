-- ---------------------------------------------------------------------------
-- 20260610000018_fix_snapshot_format.sql
--
-- Bug fix: snapshot_course_version used format('...version %.1f...', v_version)
-- but PostgreSQL's format() only supports %s / %I / %L / %% — NOT printf-style
-- float specifiers like %.1f. This raised SQLSTATE 22023
-- ("unrecognized format() type specifier") on EVERY transition to 'publishing'
-- (transition_course_status calls snapshot_course_version when entering
-- publishing), making it impossible for any course to be published.
--
-- Fix: use %s for the numeric version (NUMERIC renders fine as text).
-- Only the change_summary format string is corrected; logic is unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.snapshot_course_version(
  p_course_id  UUID,
  p_actor_id   TEXT DEFAULT 'system'
) RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_course    public.courses%ROWTYPE;
  v_snapshot  JSONB;
  v_version   NUMERIC(4,1);
  v_snap_id   UUID;
BEGIN
  SELECT * INTO v_course FROM public.courses WHERE id = p_course_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Determine next version number
  SELECT COALESCE(MAX(version), 0) + 0.1 INTO v_version
  FROM public.course_iterations WHERE course_id = p_course_id;

  -- Build snapshot (course + blueprint + modules summary)
  SELECT jsonb_build_object(
    'course',    row_to_json(v_course),
    'blueprint', (SELECT row_to_json(cb) FROM public.course_blueprints cb
                  WHERE cb.course_id = p_course_id AND cb.is_active = TRUE LIMIT 1),
    'modules',   (SELECT jsonb_agg(row_to_json(m)) FROM public.modules m
                  WHERE m.course_id = p_course_id AND m.deleted_at IS NULL),
    'market_doc',(SELECT row_to_json(mrd) FROM public.market_research_documents mrd
                  WHERE mrd.course_id = p_course_id AND mrd.is_active = TRUE LIMIT 1),
    'snapped_at', NOW()
  ) INTO v_snapshot;

  INSERT INTO public.course_iterations (
    course_id, version, snapshot_json, triggered_by, change_summary
  ) VALUES (
    p_course_id, v_version, v_snapshot, p_actor_id,
    format('Auto-snapshot at version %s. Triggered by %s.', v_version, p_actor_id)
  ) RETURNING id INTO v_snap_id;

  -- Update course current_version
  UPDATE public.courses SET current_version = v_version WHERE id = p_course_id;

  RETURN v_snap_id;
END;
$$;
