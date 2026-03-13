
-- V-7001: event_count auto-increment trigger for correlated_incidents
-- Avoids N+1 COUNT queries on dashboards
CREATE OR REPLACE FUNCTION public.increment_incident_event_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE correlated_incidents
  SET event_count = event_count + 1
  WHERE id = NEW.incident_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_incident_event_count ON correlated_incident_events;
CREATE TRIGGER trg_increment_incident_event_count
  AFTER INSERT ON correlated_incident_events
  FOR EACH ROW
  EXECUTE FUNCTION increment_incident_event_count();

-- V-7002: Pre-aggregation table for dashboard stats (avoids COUNT(*) on every refresh)
CREATE TABLE IF NOT EXISTS public.dashboard_stats_cache (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stat_key text NOT NULL,
  stat_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, stat_key)
);

ALTER TABLE public.dashboard_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation on dashboard_stats_cache"
  ON public.dashboard_stats_cache
  FOR ALL
  TO authenticated
  USING (tenant_id IN (
    SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
  ));

-- V-7003: Index for heartbeat-related queries on agents table
CREATE INDEX IF NOT EXISTS idx_agents_tenant_status
ON public.agents(tenant_id, status);

-- V-7004: Partial index for open system_alerts (dashboard widget)
CREATE INDEX IF NOT EXISTS idx_system_alerts_open
ON public.system_alerts(tenant_id, created_at DESC)
WHERE status = 'active';

-- V-7005: Index for correlation dedup check
CREATE INDEX IF NOT EXISTS idx_correlated_incidents_dedup
ON public.correlated_incidents(tenant_id, correlation_rule, last_event_time DESC);
