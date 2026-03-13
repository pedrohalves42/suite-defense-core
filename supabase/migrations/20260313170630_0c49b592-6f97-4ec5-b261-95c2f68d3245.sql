
-- V-6001: Composite indices for high-volume query patterns
-- correlated_incidents: tenant + status + time (dashboard queries)
CREATE INDEX IF NOT EXISTS idx_correlated_incidents_tenant_status_time 
ON public.correlated_incidents(tenant_id, status, created_at DESC);

-- threat_indicators: lookup by type/value per tenant
CREATE INDEX IF NOT EXISTS idx_threat_indicators_tenant_type_value 
ON public.threat_indicators(tenant_id, indicator_type, indicator_value);

-- system_alerts: tenant + severity + time (dashboard/SOC queries)
CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_severity_time 
ON public.system_alerts(tenant_id, severity, created_at DESC);

-- endpoint_detection_events: tenant + time (telemetry dashboard)
CREATE INDEX IF NOT EXISTS idx_edr_detections_tenant_time 
ON public.endpoint_detection_events(tenant_id, event_time DESC);

-- endpoint_detection_events: tenant + status (open detections)
CREATE INDEX IF NOT EXISTS idx_edr_detections_tenant_status 
ON public.endpoint_detection_events(tenant_id, status) WHERE status = 'open';

-- endpoint_process_events: tenant + agent + time (agent detail view)
CREATE INDEX IF NOT EXISTS idx_edr_process_tenant_agent_time 
ON public.endpoint_process_events(tenant_id, agent_id, event_time DESC);

-- endpoint_file_events: tenant + agent + time
CREATE INDEX IF NOT EXISTS idx_edr_file_tenant_agent_time 
ON public.endpoint_file_events(tenant_id, agent_id, event_time DESC);

-- endpoint_network_events: tenant + agent + time
CREATE INDEX IF NOT EXISTS idx_edr_network_tenant_agent_time 
ON public.endpoint_network_events(tenant_id, agent_id, event_time DESC);

-- endpoint_registry_events: tenant + agent + time
CREATE INDEX IF NOT EXISTS idx_edr_registry_tenant_agent_time 
ON public.endpoint_registry_events(tenant_id, agent_id, event_time DESC);

-- jobs: tenant + status + time (dashboard polling)
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status_time 
ON public.jobs(tenant_id, status, created_at DESC);

-- audit_logs: tenant + time (compliance/dashboard)
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time 
ON public.audit_logs(tenant_id, created_at DESC);

-- vuln_findings: agent + check_key (upsert conflict target)
CREATE INDEX IF NOT EXISTS idx_vuln_findings_agent_checkkey 
ON public.vuln_findings(agent_id, check_key);

-- correlated_incident_events: incident lookup
CREATE INDEX IF NOT EXISTS idx_incident_events_incident_time 
ON public.correlated_incident_events(incident_id, event_time);
