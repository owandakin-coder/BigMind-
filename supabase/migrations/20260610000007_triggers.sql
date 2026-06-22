-- =============================================================================
-- Migration 0007: Triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared: updated_at auto-maintenance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'tier_configs','user_profiles','courses','course_iterations',
    'market_research_documents','course_blueprints','modules','lessons',
    'digital_assets','approvals','analytics_events','analytics_tasks',
    'platform_publish_logs'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_updated_at
       BEFORE UPDATE ON public.%1$s
       FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Auto-create user_profile on auth.users INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_user_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, tier)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'free'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auth_users_create_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.fn_create_user_profile();

-- ---------------------------------------------------------------------------
-- Auto-generate course slug on INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_course_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter   INTEGER := 0;
BEGIN
  IF NEW.slug IS NOT NULL THEN RETURN NEW; END IF;

  base_slug := lower(
    regexp_replace(
      regexp_replace(NEW.title, '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
  );
  base_slug := trim(both '-' from base_slug);
  base_slug := substr(base_slug, 1, 80);  -- max slug length
  candidate := base_slug;

  WHILE EXISTS (SELECT 1 FROM public.courses WHERE slug = candidate AND id != NEW.id) LOOP
    counter  := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_courses_generate_slug
  BEFORE INSERT ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.fn_generate_course_slug();

-- ---------------------------------------------------------------------------
-- Deactivate previous market_research_documents when new one is inserted
-- (ensures is_active = TRUE on exactly one document per course)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_deactivate_old_market_doc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE public.market_research_documents
    SET is_active = FALSE
    WHERE course_id = NEW.course_id
      AND id != NEW.id
      AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mrd_single_active
  AFTER INSERT OR UPDATE OF is_active ON public.market_research_documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_deactivate_old_market_doc();

-- Identical pattern for course_blueprints
CREATE OR REPLACE FUNCTION public.fn_deactivate_old_blueprint()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE public.course_blueprints
    SET is_active = FALSE
    WHERE course_id = NEW.course_id
      AND id != NEW.id
      AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_blueprint_single_active
  AFTER INSERT OR UPDATE OF is_active ON public.course_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.fn_deactivate_old_blueprint();

-- ---------------------------------------------------------------------------
-- Deactivate old digital_assets when new version of same type is inserted
-- (is_active = TRUE on exactly one asset per (source_id, asset_type, platform_target))
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_deactivate_old_asset_version()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_active = TRUE THEN
    UPDATE public.digital_assets
    SET is_active = FALSE
    WHERE source_type     = NEW.source_type
      AND source_id       = NEW.source_id
      AND asset_type      = NEW.asset_type
      AND COALESCE(platform_target::TEXT, '') = COALESCE(NEW.platform_target::TEXT, '')
      AND id              != NEW.id
      AND is_active       = TRUE
      AND is_locked       = FALSE;  -- never deactivate locked assets
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_digital_assets_single_active
  AFTER INSERT ON public.digital_assets
  FOR EACH ROW EXECUTE FUNCTION public.fn_deactivate_old_asset_version();

-- ---------------------------------------------------------------------------
-- Prevent mutation of agent_logs (immutable audit trail)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_block_agent_log_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'agent_logs is immutable — UPDATE and DELETE are forbidden'
    USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER trg_agent_logs_immutable
  BEFORE UPDATE OR DELETE ON public.agent_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_block_agent_log_mutation();

-- ---------------------------------------------------------------------------
-- Enforce max_modules_per_course from tier_configs on modules INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_module_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.modules
  WHERE course_id = NEW.course_id AND deleted_at IS NULL;

  SELECT tc.max_modules_per_course INTO v_limit
  FROM public.tier_configs tc
  JOIN public.user_profiles up ON up.tier = tc.tier
  JOIN public.courses c ON c.owner_id = up.id
  WHERE c.id = NEW.course_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'module_limit_exceeded: tier allows % modules per course', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modules_enforce_limit
  BEFORE INSERT ON public.modules
  FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_module_limit();

-- ---------------------------------------------------------------------------
-- Notify n8n via pg_notify when course status changes
-- (Secondary delivery mechanism alongside DB Webhooks — belt-and-suspenders)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_notify_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'courseforge_status_change',
      jsonb_build_object(
        'course_id',    NEW.id,
        'old_status',   OLD.status,
        'new_status',   NEW.status,
        'owner_id',     NEW.owner_id,
        'platform',     NEW.platform_target,
        'timestamp',    NOW()
      )::TEXT
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_courses_notify_status
  AFTER UPDATE OF status ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_status_change();

-- ---------------------------------------------------------------------------
-- Auto-evaluate analytics thresholds and create analytics_tasks
-- Runs after analytics_events INSERT or UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_evaluate_analytics_thresholds()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_refund_val   NUMERIC;
BEGIN
  -- Threshold 1: Module drop-off > 60%
  IF NEW.metric_name = 'lesson_dropoff'
     AND NEW.metric_value > 0.60
     AND NEW.trigger_fired = FALSE
  THEN
    INSERT INTO public.analytics_tasks (
      course_id, trigger_type, target_agent, target_entity_id,
      message, priority, metric_name, metric_value, threshold
    ) VALUES (
      NEW.course_id, 'redesign', 'course_architect_agent', NEW.module_id,
      format('Module drop-off %.0f%% exceeds 60%% threshold. Redesign or split lessons.',
             NEW.metric_value * 100),
      'high', 'lesson_dropoff', NEW.metric_value, 0.60
    );

    UPDATE public.analytics_events
    SET trigger_fired = TRUE, trigger_type = 'redesign'
    WHERE id = NEW.id;
  END IF;

  -- Threshold 2: Sales conversion > 5% but refund > 10% (over-promise signal)
  IF NEW.metric_name = 'sales_conversion' AND NEW.metric_value > 0.05 THEN
    SELECT metric_value INTO v_refund_val
    FROM public.analytics_events
    WHERE course_id = NEW.course_id
      AND metric_name = 'refund'
      AND window_date = NEW.window_date;

    IF v_refund_val IS NOT NULL AND v_refund_val > 0.10 THEN
      INSERT INTO public.analytics_tasks (
        course_id, trigger_type, target_agent, message,
        priority, metric_name, metric_value, threshold
      ) VALUES (
        NEW.course_id, 'content_gap', 'sales_page_agent',
        format('Conversion %.1f%% is strong but refund %.1f%% signals over-promise. Harmonize expectations.',
               NEW.metric_value * 100, v_refund_val * 100),
        'high', 'refund', v_refund_val, 0.10
      );
    END IF;
  END IF;

  -- Threshold 3: Quiz fail rate > 50% → simplify content
  IF NEW.metric_name = 'quiz_pass_rate'
     AND NEW.metric_value < 0.50
     AND NEW.trigger_fired = FALSE
  THEN
    INSERT INTO public.analytics_tasks (
      course_id, trigger_type, target_agent, target_entity_id,
      message, priority, metric_name, metric_value, threshold
    ) VALUES (
      NEW.course_id, 'simplify', 'content_production_agent', NEW.lesson_id,
      format('Quiz pass rate %.0f%% below 50%%. Content may be too complex.',
             NEW.metric_value * 100),
      'medium', 'quiz_pass_rate', NEW.metric_value, 0.50
    );

    UPDATE public.analytics_events
    SET trigger_fired = TRUE, trigger_type = 'simplify'
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_analytics_evaluate_thresholds
  AFTER INSERT OR UPDATE OF metric_value ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_evaluate_analytics_thresholds();
