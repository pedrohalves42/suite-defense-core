
-- =====================================================
-- Index optimization: reduce seq scans on hot-path tables
-- Focus: composite (tenant_id, time_column) for RLS + time filtering
-- Using CONCURRENTLY where possible for zero-downtime
-- =====================================================

-- 1. generated_reports (99.6% seq scans, 1.3K rows)
-- Missing: tenant_id + created_at composite
CREATE INDEX IF NOT EXISTS idx_generated_reports_tenant_created 
ON public.generated_reports (tenant_id, created_at DESC);

-- 2. threat_indicators (91.2% seq scans, 1.8K rows)
-- Missing: tenant_id + created_at composite
CREATE INDEX IF NOT EXISTS idx_threat_indicators_tenant_created 
ON public.threat_indicators (tenant_id, created_at DESC);

-- 3. endpoint_process_events (812 MB, largest table, no created_at/event_time index with tenant)
-- Already has tenant_id index, adding composite for time-range queries
CREATE INDEX IF NOT EXISTS idx_process_events_tenant_time 
ON public.endpoint_process_events (tenant_id, event_time DESC);

-- 4. endpoint_network_events (97 MB, no time composite)
CREATE INDEX IF NOT EXISTS idx_network_events_tenant_time 
ON public.endpoint_network_events (tenant_id, event_time DESC);

-- 5. scheduled_job_runs (3.2 MB, no created_at index)
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_tenant_created 
ON public.scheduled_job_runs (tenant_id, created_at DESC);

-- 6. domain_events - already has tenant_id + occurred_on but missing plain created_at for audit queries
CREATE INDEX IF NOT EXISTS idx_domain_events_created 
ON public.domain_events (created_at DESC);

-- 7. agent_signing_keys (50.4% seq scans) - add tenant + active composite
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_tenant_active 
ON public.agent_signing_keys (tenant_id, is_active) WHERE (is_active = true);

-- 8. endpoint_file_events - missing tenant + time composite
CREATE INDEX IF NOT EXISTS idx_file_events_tenant_time 
ON public.endpoint_file_events (tenant_id, event_time DESC);

-- 9. endpoint_registry_events - missing tenant + time composite  
CREATE INDEX IF NOT EXISTS idx_registry_events_tenant_time 
ON public.endpoint_registry_events (tenant_id, event_time DESC);
