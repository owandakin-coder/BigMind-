-- update_lesson_content — owner-only edit of a lesson's written content.
-- Lesson-level digital_assets (source_id = lessonId) aren't covered by the
-- assets_update_unlocked RLS policy, so edits go through this SECURITY DEFINER
-- RPC which verifies the caller owns the lesson's course.

CREATE OR REPLACE FUNCTION public.update_lesson_content(
  p_lesson_id      uuid,
  p_title          text  DEFAULT NULL,
  p_body_markdown  text  DEFAULT NULL,
  p_key_takeaways  jsonb DEFAULT NULL,
  p_call_to_action text  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner    uuid;
  v_asset_id uuid;
  v_content  jsonb;
BEGIN
  -- Ownership check
  SELECT c.owner_id INTO v_owner
  FROM lessons l
  JOIN courses c ON c.id = l.course_id
  WHERE l.id = p_lesson_id AND l.deleted_at IS NULL;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'lesson_not_found';
  END IF;
  IF auth.uid() IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Update lesson title
  IF p_title IS NOT NULL THEN
    UPDATE lessons SET title = p_title, updated_at = now() WHERE id = p_lesson_id;
  END IF;

  -- Merge edits into the latest active lesson_script asset's content_json
  SELECT id, content_json INTO v_asset_id, v_content
  FROM digital_assets
  WHERE source_id = p_lesson_id
    AND asset_type = 'lesson_script'
    AND deleted_at IS NULL
    AND is_locked = FALSE
  ORDER BY is_active DESC, created_at DESC
  LIMIT 1;

  IF v_asset_id IS NOT NULL THEN
    v_content := COALESCE(v_content, '{}'::jsonb);
    IF p_body_markdown  IS NOT NULL THEN v_content := jsonb_set(v_content, '{body_markdown}',  to_jsonb(p_body_markdown)); END IF;
    IF p_title          IS NOT NULL THEN v_content := jsonb_set(v_content, '{title}',          to_jsonb(p_title)); END IF;
    IF p_key_takeaways  IS NOT NULL THEN v_content := jsonb_set(v_content, '{key_takeaways}',  p_key_takeaways); END IF;
    IF p_call_to_action IS NOT NULL THEN v_content := jsonb_set(v_content, '{call_to_action}', to_jsonb(p_call_to_action)); END IF;
    UPDATE digital_assets SET content_json = v_content WHERE id = v_asset_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'lesson_id', p_lesson_id, 'asset_id', v_asset_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_lesson_content(uuid, text, text, jsonb, text) TO authenticated;
