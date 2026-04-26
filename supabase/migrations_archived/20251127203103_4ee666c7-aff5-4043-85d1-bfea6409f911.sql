-- FASE 3: Popular Agent Timeline com Heartbeats e Metricas
-- Recria view agent_timeline_events com eventos adicionais

DROP VIEW IF EXISTS public.agent_timeline_events;

CREATE OR REPLACE VIEW public.agent_timeline_events
WITH (security_invoker = on)
AS
-- Jobs events
SELECT 
  j.tenant_id,
  j.agent_id,
  j.id AS source_id,
  'job'::text AS event_type,
  CASE
    WHEN j.status = 'queued' THEN 'job_queued'::text
    WHEN j.status = 'delivered' THEN 'job_delivered'::text
    WHEN j.status = 'completed' THEN 'job_completed'::text
    WHEN j.status = 'failed' THEN 'job_failed'::text
    ELSE 'job_event'::text
  END AS event_key,
  COALESCE(j.created_at, NOW()) AS event_time,
  jsonb_build_object(
    'job_type', j.type,
    'status', j.status,
    'error_message', j.error_message
  ) AS data
FROM public.jobs j
WHERE j.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)

UNION ALL

-- Heartbeat events (agentes que enviaram heartbeat nas ultimas 24h)
SELECT 
  a.tenant_id,
  a.id AS agent_id,
  a.id AS source_id,
  'heartbeat'::text AS event_type,
  'heartbeat_received'::text AS event_key,
  a.last_heartbeat AS event_time,
  jsonb_build_object(
    'agent_name', a.agent_name,
    'hostname', a.hostname,
    'os_type', a.os_type,
    'agent_version', a.agent_version,
    'status', a.status
  ) AS data
FROM public.agents a
WHERE a.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)
AND a.last_heartbeat IS NOT NULL
AND a.last_heartbeat > NOW() - INTERVAL '24 hours'

UNION ALL

-- System metrics events (metricas enviadas nas ultimas 24h)
SELECT 
  m.tenant_id,
  m.agent_id,
  m.id AS source_id,
  'metrics'::text AS event_type,
  'metrics_collected'::text AS event_key,
  m.collected_at AS event_time,
  jsonb_build_object(
    'cpu_usage', m.cpu_usage_percent,
    'memory_usage', m.memory_usage_percent,
    'disk_usage', m.disk_usage_percent
  ) AS data
FROM public.agent_system_metrics m
WHERE m.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)
AND m.collected_at > NOW() - INTERVAL '24 hours'

UNION ALL

-- Vulnerability findings
SELECT 
  vf.tenant_id,
  vf.agent_id,
  vf.id AS source_id,
  'vuln_finding'::text AS event_type,
  'vuln_detected'::text AS event_key,
  vf.first_seen_at AS event_time,
  jsonb_build_object(
    'severity', vf.severity,
    'title', vf.title,
    'check_key', vf.check_key
  ) AS data
FROM public.vuln_findings vf
WHERE vf.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)

UNION ALL

-- Security events
SELECT 
  se.tenant_id,
  se.agent_id,
  se.id AS source_id,
  'security_event'::text AS event_type,
  'policy_triggered'::text AS event_key,
  se.created_at AS event_time,
  jsonb_build_object(
    'severity', se.severity,
    'title', se.title,
    'status', se.status
  ) AS data
FROM public.security_events se
WHERE se.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)

UNION ALL

-- Anomaly events
SELECT 
  ae.tenant_id,
  ae.agent_id,
  ae.id AS source_id,
  'anomaly'::text AS event_type,
  'anomaly_detected'::text AS event_key,
  ae.created_at AS event_time,
  jsonb_build_object(
    'type', ae.type,
    'severity', ae.severity
  ) AS data
FROM public.anomaly_events ae
WHERE ae.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)

UNION ALL

-- Virus scans (join com agents para obter agent_id)
SELECT 
  vs.tenant_id,
  a.id AS agent_id,
  vs.id AS source_id,
  'virus_scan'::text AS event_type,
  CASE
    WHEN vs.is_malicious = true THEN 'threat_detected'::text
    ELSE 'scan_completed'::text
  END AS event_key,
  vs.scanned_at AS event_time,
  jsonb_build_object(
    'file_path', vs.file_path,
    'is_malicious', vs.is_malicious,
    'file_hash', vs.file_hash,
    'virustotal_permalink', vs.virustotal_permalink
  ) AS data
FROM public.virus_scans vs
JOIN public.agents a ON a.agent_name = vs.agent_name AND a.tenant_id = vs.tenant_id
WHERE vs.tenant_id IN (
  SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
)

ORDER BY event_time DESC;

COMMENT ON VIEW public.agent_timeline_events IS 'Unified timeline of all agent events: jobs, heartbeats, metrics, scans, vulnerabilities, security events, and anomalies';
