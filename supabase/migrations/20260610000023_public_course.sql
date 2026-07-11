-- get_public_course — returns a curated, read-only JSON view of a LIVE course
-- for the public student page. SECURITY DEFINER so it can read across tables
-- WITHOUT granting anon broad table access; only live/published courses are
-- exposed, and only safe fields (no owner_id, pricing internals, etc.).

CREATE OR REPLACE FUNCTION public.get_public_course(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_fw     jsonb;
  v_result jsonb;
BEGIN
  SELECT status INTO v_status
  FROM courses
  WHERE id = p_course_id AND deleted_at IS NULL;

  -- Only published/live courses are publicly viewable
  IF v_status IS NULL OR v_status NOT IN ('live', 'live_analytics') THEN
    RETURN NULL;
  END IF;

  SELECT core_framework INTO v_fw
  FROM course_blueprints
  WHERE course_id = p_course_id AND is_active = TRUE
  LIMIT 1;

  SELECT jsonb_build_object(
    'title',      COALESCE(v_fw->>'course_title', (SELECT title FROM courses WHERE id = p_course_id)),
    'subtitle',   v_fw->>'subtitle',
    'tagline',    v_fw->>'tagline',
    'objectives', COALESCE(v_fw->'learning_objectives', '[]'::jsonb),
    'modules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'title',       m.title,
          'description', m.description,
          'lessons', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'title', l.title,
                'hook',  l.context_hook,
                'body_markdown', (
                  SELECT da.content_json->>'body_markdown'
                  FROM digital_assets da
                  WHERE da.source_id = l.id AND da.asset_type = 'lesson_script' AND da.deleted_at IS NULL
                  ORDER BY da.created_at DESC LIMIT 1
                ),
                'key_takeaways', (
                  SELECT da.content_json->'key_takeaways'
                  FROM digital_assets da
                  WHERE da.source_id = l.id AND da.asset_type = 'lesson_script' AND da.deleted_at IS NULL
                  ORDER BY da.created_at DESC LIMIT 1
                )
              ) ORDER BY l.sort_order
            )
            FROM lessons l
            WHERE l.module_id = m.id AND l.deleted_at IS NULL
          ), '[]'::jsonb)
        ) ORDER BY m.sort_order
      )
      FROM modules m
      WHERE m.course_id = p_course_id AND m.deleted_at IS NULL
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_course(uuid) TO anon, authenticated;
