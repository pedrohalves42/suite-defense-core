-- assert_heartbeat_thresholds.sql
-- P0-02 invariant guard: canonical heartbeat/alert functions must exist,
-- be SECURITY DEFINER, own an explicit search_path, and target system_alerts.
-- Run in CI as part of security-invariants workflow.

DO $$
DECLARE
  v_missing text := '';
  v_row RECORD;
BEGIN
  -- 1. auto_mark_agents_inactive exists and is SECURITY DEFINER with search_path
  SELECT prosecdef, proconfig
  INTO v_row
  FROM pg_proc
  WHERE proname = 'auto_mark_agents_inactive'
    AND pronamespace = 'public'::regnamespace;

  IF NOT FOUND THEN
    v_missing := v_missing || 'auto_mark_agents_inactive missing; ';
  ELSIF NOT v_row.prosecdef THEN
    v_missing := v_missing || 'auto_mark_agents_inactive is not SECURITY DEFINER; ';
  ELSIF v_row.proconfig IS NULL OR NOT (v_row.proconfig::text ILIKE '%search_path%') THEN
    v_missing := v_missing || 'auto_mark_agents_inactive missing explicit search_path; ';
  END IF;

  -- 2. alert_short_offline_agents exists with same guards
  SELECT prosecdef, proconfig
  INTO v_row
  FROM pg_proc
  WHERE proname = 'alert_short_offline_agents'
    AND pronamespace = 'public'::regnamespace;

  IF NOT FOUND THEN
    v_missing := v_missing || 'alert_short_offline_agents missing; ';
  ELSIF NOT v_row.prosecdef THEN
    v_missing := v_missing || 'alert_short_offline_agents is not SECURITY DEFINER; ';
  ELSIF v_row.proconfig IS NULL OR NOT (v_row.proconfig::text ILIKE '%search_path%') THEN
    v_missing := v_missing || 'alert_short_offline_agents missing explicit search_path; ';
  END IF;

  -- 3. alert_short_offline_agents must write to system_alerts
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'alert_short_offline_agents'
      AND pronamespace = 'public'::regnamespace
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.proname = 'alert_short_offline_agents'
        AND p.pronamespace = 'public'::regnamespace
        AND pg_get_functiondef(p.oid) ILIKE '%system_alerts%'
    ) THEN
      v_missing := v_missing || 'alert_short_offline_agents does not reference system_alerts; ';
    END IF;
  END IF;

  -- 4. alert_short_offline_agents must use 3 minutes threshold
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'alert_short_offline_agents'
      AND p.pronamespace = 'public'::regnamespace
      AND pg_get_functiondef(p.oid) ILIKE '%3 minutes%'
  ) THEN
    NULL;
  ELSE
    v_missing := v_missing || 'alert_short_offline_agents threshold != 3 minutes; ';
  END IF;

  IF v_missing <> '' THEN
    RAISE EXCEPTION 'P0-02 heartbeat invariants violated: %', v_missing;
  END IF;

  RAISE NOTICE 'P0-02 heartbeat invariants OK.';
END $$;
