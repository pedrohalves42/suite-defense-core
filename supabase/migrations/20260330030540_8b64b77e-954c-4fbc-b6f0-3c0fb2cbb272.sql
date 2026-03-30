
-- Views for partitioned tables
CREATE OR REPLACE VIEW v_process_events_recent WITH (security_invoker = on) AS
SELECT *
FROM endpoint_process_events_partitioned
WHERE created_at >= NOW() - INTERVAL '7 days';

CREATE OR REPLACE VIEW v_network_events_recent WITH (security_invoker = on) AS
SELECT *
FROM endpoint_network_events_partitioned
WHERE created_at >= NOW() - INTERVAL '7 days';

CREATE OR REPLACE VIEW v_event_buffer_pending WITH (security_invoker = on) AS
SELECT *
FROM endpoint_event_buffer_partitioned
WHERE processed_at IS NULL;

-- RPC: process events (tenant_id is UUID)
CREATE OR REPLACE FUNCTION get_agent_processes(
  p_agent_id UUID,
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF endpoint_process_events_partitioned
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM endpoint_process_events_partitioned
  WHERE agent_id = p_agent_id AND tenant_id = p_tenant_id
  ORDER BY created_at DESC LIMIT p_limit;
$$;

-- RPC: network events (tenant_id is UUID)
CREATE OR REPLACE FUNCTION get_agent_network_events(
  p_agent_id UUID,
  p_tenant_id UUID,
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF endpoint_network_events_partitioned
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM endpoint_network_events_partitioned
  WHERE agent_id = p_agent_id AND tenant_id = p_tenant_id
  ORDER BY created_at DESC LIMIT p_limit;
$$;

-- RPC: pending events (tenant_id is TEXT in this table)
CREATE OR REPLACE FUNCTION get_pending_events(
  p_tenant_id TEXT,
  p_limit INTEGER DEFAULT 500
)
RETURNS SETOF endpoint_event_buffer_partitioned
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM endpoint_event_buffer_partitioned
  WHERE tenant_id = p_tenant_id AND processed_at IS NULL
  ORDER BY received_at ASC LIMIT p_limit;
$$;

-- Helper: check if partitioned version exists
CREATE OR REPLACE FUNCTION is_table_migrated(p_table_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = p_table_name || '_partitioned'
      AND table_schema = 'public'
  );
$$;

-- Deprecation comments
COMMENT ON TABLE endpoint_process_events IS 'DEPRECATED: Use endpoint_process_events_partitioned';
COMMENT ON TABLE endpoint_event_buffer IS 'DEPRECATED: Use endpoint_event_buffer_partitioned';
COMMENT ON TABLE endpoint_network_events IS 'DEPRECATED: Use endpoint_network_events_partitioned';
