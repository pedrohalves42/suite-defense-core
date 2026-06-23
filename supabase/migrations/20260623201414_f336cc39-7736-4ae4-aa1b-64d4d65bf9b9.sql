-- Snapshot table
CREATE TABLE IF NOT EXISTS public.pp02b_canary_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  tenant_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  -- Coalescer proxies (agent_hmac_format_cache writes in window)
  coalescer_rows_written integer NOT NULL,
  coalescer_distinct_agents integer NOT NULL,
  coalescer_total_hit_count bigint NOT NULL,
  -- Auth/HMAC
  token_validation_failures integer NOT NULL,
  -- Heartbeat freshness for canary agent
  canary_agent_id uuid,
  canary_last_heartbeat timestamptz,
  canary_heartbeat_age_seconds integer,
  -- Verdicts
  verdict_coalescer text NOT NULL,
  verdict_auth text NOT NULL,
  verdict_heartbeat text NOT NULL,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pp02b_canary_snapshots TO authenticated;
GRANT ALL ON public.pp02b_canary_snapshots TO service_role;

ALTER TABLE public.pp02b_canary_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role full access pp02b_canary_snapshots"
  ON public.pp02b_canary_snapshots FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "super_admin read pp02b_canary_snapshots"
  ON public.pp02b_canary_snapshots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Collector + classifier
CREATE OR REPLACE FUNCTION public.snapshot_pp02b_canary(p_label text)
RETURNS public.pp02b_canary_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
  v_tenant uuid := '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e';
  v_window_start timestamptz := '2026-06-23 20:08:49+00';
  v_window_end timestamptz := now();
  v_rows int;
  v_agents int;
  v_hits bigint;
  v_tvf int;
  v_agent uuid;
  v_last_hb timestamptz;
  v_hb_age int;
  v_v_coalescer text;
  v_v_auth text;
  v_v_hb text;
  v_row public.pp02b_canary_snapshots;
BEGIN
  -- Coalescer proxy: rows in agent_hmac_format_cache touched in window
  SELECT count(*), count(DISTINCT agent_id), COALESCE(sum(hit_count), 0)
    INTO v_rows, v_agents, v_hits
  FROM public.agent_hmac_format_cache
  WHERE tenant_id = v_tenant
    AND last_verified_at >= v_window_start
    AND last_verified_at <= v_window_end;

  -- Auth failures in window (not tenant-scoped column-wise, but rare globally)
  SELECT count(*) INTO v_tvf
  FROM public.token_validation_failures
  WHERE created_at >= v_window_start AND created_at <= v_window_end;

  -- Canary agent heartbeat
  SELECT id, last_heartbeat
    INTO v_agent, v_last_hb
  FROM public.agents
  WHERE tenant_id = v_tenant
    AND agent_name = 'Pc-Yasmin-Tocantins'
  ORDER BY last_heartbeat DESC NULLS LAST
  LIMIT 1;

  v_hb_age := CASE WHEN v_last_hb IS NULL THEN NULL
                   ELSE EXTRACT(EPOCH FROM (now() - v_last_hb))::int END;

  -- Classification
  v_v_coalescer := CASE
    WHEN v_rows > 0 AND v_hits > 0 THEN 'PASS'
    WHEN v_rows > 0 THEN 'WATCH'
    ELSE 'FAIL'  -- expected coalescer writes never appeared
  END;

  v_v_auth := CASE
    WHEN v_tvf = 0 THEN 'PASS'
    WHEN v_tvf <= 2 THEN 'WATCH'
    ELSE 'FAIL'
  END;

  v_v_hb := CASE
    WHEN v_hb_age IS NULL THEN 'FAIL'
    WHEN v_hb_age <= 600 THEN 'PASS'      -- <=10 min
    WHEN v_hb_age <= 1200 THEN 'WATCH'    -- <=20 min
    ELSE 'FAIL'
  END;

  INSERT INTO public.pp02b_canary_snapshots(
    label, tenant_id, window_start, window_end,
    coalescer_rows_written, coalescer_distinct_agents, coalescer_total_hit_count,
    token_validation_failures,
    canary_agent_id, canary_last_heartbeat, canary_heartbeat_age_seconds,
    verdict_coalescer, verdict_auth, verdict_heartbeat
  ) VALUES (
    p_label, v_tenant, v_window_start, v_window_end,
    v_rows, v_agents, v_hits,
    v_tvf,
    v_agent, v_last_hb, v_hb_age,
    v_v_coalescer, v_v_auth, v_v_hb
  ) RETURNING * INTO v_row;

  RETURN v_row;
END $$;

REVOKE EXECUTE ON FUNCTION public.snapshot_pp02b_canary(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_pp02b_canary(text) TO service_role;