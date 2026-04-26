
-- ============================================================
-- Sprint 29: Data Retention + Event Summarization
-- ============================================================

-- 1. Telemetry retention config per tenant
CREATE TABLE IF NOT EXISTS public.telemetry_retention_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_category TEXT NOT NULL, -- 'process', 'file', 'network', 'registry', 'detection'
  retention_days INTEGER NOT NULL DEFAULT 90,
  summarize_after_days INTEGER NOT NULL DEFAULT 30,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, event_category)
);

ALTER TABLE public.telemetry_retention_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.telemetry_retention_config
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "tenant_isolation_insert" ON public.telemetry_retention_config
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "tenant_isolation_update" ON public.telemetry_retention_config
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "service_role_all" ON public.telemetry_retention_config
  FOR ALL TO service_role USING (true);

-- 2. Event summaries table (hourly/daily aggregates)
CREATE TABLE IF NOT EXISTS public.telemetry_event_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,
  event_category TEXT NOT NULL,
  summary_period TEXT NOT NULL DEFAULT 'hourly', -- 'hourly' or 'daily'
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  total_events INTEGER NOT NULL DEFAULT 0,
  suspicious_events INTEGER NOT NULL DEFAULT 0,
  event_types JSONB NOT NULL DEFAULT '{}',
  top_processes TEXT[] DEFAULT '{}',
  top_destinations TEXT[] DEFAULT '{}',
  mitre_techniques TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, agent_id, event_category, summary_period, period_start)
);

ALTER TABLE public.telemetry_event_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_select" ON public.telemetry_event_summaries
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "service_role_all" ON public.telemetry_event_summaries
  FOR ALL TO service_role USING (true);

-- 3. Indexes for retention cleanup queries
CREATE INDEX IF NOT EXISTS idx_process_events_retention 
  ON public.endpoint_process_events (tenant_id, event_time);

CREATE INDEX IF NOT EXISTS idx_file_events_retention 
  ON public.endpoint_file_events (tenant_id, event_time);

CREATE INDEX IF NOT EXISTS idx_network_events_retention 
  ON public.endpoint_network_events (tenant_id, event_time);

CREATE INDEX IF NOT EXISTS idx_registry_events_retention 
  ON public.endpoint_registry_events (tenant_id, event_time);

CREATE INDEX IF NOT EXISTS idx_detection_events_retention 
  ON public.endpoint_detection_events (tenant_id, event_time);

CREATE INDEX IF NOT EXISTS idx_event_summaries_lookup 
  ON public.telemetry_event_summaries (tenant_id, event_category, period_start);

-- 4. Cleanup function for expired telemetry
CREATE OR REPLACE FUNCTION public.cleanup_expired_telemetry()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_cutoff TIMESTAMPTZ;
  v_deleted INTEGER;
  v_results JSONB := '[]'::JSONB;
  v_table_name TEXT;
BEGIN
  FOR v_config IN
    SELECT * FROM telemetry_retention_config WHERE is_enabled = true
  LOOP
    v_cutoff := now() - (v_config.retention_days || ' days')::INTERVAL;

    CASE v_config.event_category
      WHEN 'process' THEN v_table_name := 'endpoint_process_events';
      WHEN 'file' THEN v_table_name := 'endpoint_file_events';
      WHEN 'network' THEN v_table_name := 'endpoint_network_events';
      WHEN 'registry' THEN v_table_name := 'endpoint_registry_events';
      WHEN 'detection' THEN v_table_name := 'endpoint_detection_events';
      ELSE CONTINUE;
    END CASE;

    EXECUTE format(
      'DELETE FROM %I WHERE tenant_id = $1 AND event_time < $2',
      v_table_name
    ) USING v_config.tenant_id, v_cutoff;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'tenant_id', v_config.tenant_id,
      'category', v_config.event_category,
      'cutoff', v_cutoff,
      'deleted', v_deleted
    );
  END LOOP;

  RETURN jsonb_build_object('cleaned', v_results, 'run_at', now());
END;
$$;

-- 5. Summarization function
CREATE OR REPLACE FUNCTION public.summarize_telemetry_hourly(
  p_tenant_id UUID,
  p_hours_ago INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_result JSONB := '[]'::JSONB;
BEGIN
  v_end := date_trunc('hour', now() - (p_hours_ago || ' hours')::INTERVAL);
  v_start := v_end - INTERVAL '1 hour';

  -- Summarize process events
  INSERT INTO telemetry_event_summaries (tenant_id, agent_id, event_category, summary_period, period_start, period_end, total_events, suspicious_events, top_processes, mitre_techniques)
  SELECT 
    p_tenant_id,
    agent_id,
    'process',
    'hourly',
    v_start,
    v_end,
    count(*)::INTEGER,
    count(*) FILTER (WHERE is_suspicious)::INTEGER,
    (array_agg(DISTINCT process_name ORDER BY process_name) FILTER (WHERE process_name IS NOT NULL))[1:10],
    (array_agg(DISTINCT mitre_technique_id ORDER BY mitre_technique_id) FILTER (WHERE mitre_technique_id IS NOT NULL))[1:10]
  FROM endpoint_process_events
  WHERE tenant_id = p_tenant_id AND event_time >= v_start AND event_time < v_end
  GROUP BY agent_id
  ON CONFLICT (tenant_id, agent_id, event_category, summary_period, period_start) DO NOTHING;

  -- Summarize network events
  INSERT INTO telemetry_event_summaries (tenant_id, agent_id, event_category, summary_period, period_start, period_end, total_events, suspicious_events, top_destinations)
  SELECT 
    p_tenant_id,
    agent_id,
    'network',
    'hourly',
    v_start,
    v_end,
    count(*)::INTEGER,
    count(*) FILTER (WHERE is_suspicious)::INTEGER,
    (array_agg(DISTINCT remote_address ORDER BY remote_address) FILTER (WHERE remote_address IS NOT NULL))[1:10]
  FROM endpoint_network_events
  WHERE tenant_id = p_tenant_id AND event_time >= v_start AND event_time < v_end
  GROUP BY agent_id
  ON CONFLICT (tenant_id, agent_id, event_category, summary_period, period_start) DO NOTHING;

  -- Summarize file events  
  INSERT INTO telemetry_event_summaries (tenant_id, agent_id, event_category, summary_period, period_start, period_end, total_events, suspicious_events)
  SELECT 
    p_tenant_id,
    agent_id,
    'file',
    'hourly',
    v_start,
    v_end,
    count(*)::INTEGER,
    count(*) FILTER (WHERE is_suspicious)::INTEGER
  FROM endpoint_file_events
  WHERE tenant_id = p_tenant_id AND event_time >= v_start AND event_time < v_end
  GROUP BY agent_id
  ON CONFLICT (tenant_id, agent_id, event_category, summary_period, period_start) DO NOTHING;

  -- Summarize registry events
  INSERT INTO telemetry_event_summaries (tenant_id, agent_id, event_category, summary_period, period_start, period_end, total_events, suspicious_events, mitre_techniques)
  SELECT 
    p_tenant_id,
    agent_id,
    'registry',
    'hourly',
    v_start,
    v_end,
    count(*)::INTEGER,
    count(*) FILTER (WHERE is_suspicious)::INTEGER,
    (array_agg(DISTINCT mitre_technique_id ORDER BY mitre_technique_id) FILTER (WHERE mitre_technique_id IS NOT NULL))[1:10]
  FROM endpoint_registry_events
  WHERE tenant_id = p_tenant_id AND event_time >= v_start AND event_time < v_end
  GROUP BY agent_id
  ON CONFLICT (tenant_id, agent_id, event_category, summary_period, period_start) DO NOTHING;

  RETURN jsonb_build_object('summarized', true, 'period_start', v_start, 'period_end', v_end);
END;
$$;
