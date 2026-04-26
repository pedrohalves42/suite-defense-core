CREATE OR REPLACE FUNCTION public.get_evidence_summary(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH real_events AS (
    SELECT 
      event_type,
      severity,
      agent_name,
      COALESCE(event_data->>'alert_type', 'unknown') AS alert_type
    FROM agent_evidence_logs
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
      AND severity NOT IN ('info', 'debug')
      AND event_data IS DISTINCT FROM '{}'::jsonb
      AND jsonb_typeof(event_data) = 'object'
      AND (SELECT count(*) FROM jsonb_object_keys(event_data)) > 0
  ),
  -- Deduplicate ALL event types: 1 per (agent_name, alert_type, severity_bucket)
  deduped AS (
    SELECT DISTINCT ON (event_type, agent_name, alert_type, 
      CASE 
        WHEN severity = 'critical' THEN 'critical'
        WHEN severity IN ('high', 'error') THEN 'high'
        WHEN severity = 'warning' THEN 'warning'
        ELSE 'other'
      END
    )
      event_type,
      agent_name,
      alert_type,
      CASE 
        WHEN severity = 'critical' THEN 'critical'
        WHEN severity IN ('high', 'error') THEN 'high'
        WHEN severity = 'warning' THEN 'warning'
        ELSE 'other'
      END AS severity_bucket
    FROM real_events
  ),
  counts AS (
    SELECT
      (SELECT count(*) FROM deduped WHERE event_type = 'auto_repair') AS auto_repairs,
      (SELECT count(*) FROM deduped WHERE event_type = 'auto_recovery') AS auto_recoveries,
      (SELECT count(*) FROM deduped WHERE event_type = 'policy_drift') AS policy_drifts,
      (SELECT count(*) FROM deduped WHERE event_type = 'security_event' AND severity_bucket = 'critical') AS critical_prevented,
      (SELECT count(*) FROM deduped WHERE event_type = 'security_event' AND severity_bucket = 'high') AS high_prevented,
      (SELECT count(*) FROM deduped WHERE event_type = 'security_event' AND severity_bucket = 'warning') AS medium_prevented
  )
  SELECT jsonb_build_object(
    'auto_repairs', auto_repairs,
    'auto_recoveries', auto_recoveries,
    'policy_drifts', policy_drifts,
    'critical_prevented', critical_prevented,
    'high_prevented', high_prevented,
    'medium_prevented', medium_prevented,
    'incidents_contained', critical_prevented + high_prevented + medium_prevented
  )
  FROM counts;
$function$;