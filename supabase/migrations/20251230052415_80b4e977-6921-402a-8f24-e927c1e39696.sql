-- =============================================================================
-- ACTION CENTER VIEW - Consolidated action items from multiple sources
-- =============================================================================

-- View that aggregates all actionable items for the Action Center
CREATE OR REPLACE VIEW public.v_action_center AS

-- Source 1: Pending Playbook Executions
SELECT 
  pe.id AS item_id,
  'playbook' AS source_type,
  pe.tenant_id,
  pe.agent_id,
  a.agent_name,
  a.hostname,
  pb.name AS title,
  pb.description,
  pb.severity,
  pe.risk_score,
  pe.status AS action_status,
  CASE 
    WHEN pe.playbook_snapshot IS NOT NULL 
    THEN pe.playbook_snapshot->>'execution_mode'
    ELSE 'manual'
  END AS execution_mode,
  pe.trigger_context AS context,
  pe.triggered_at AS created_at,
  pb.trigger_type,
  pb.id AS playbook_id,
  -- Calculate priority score
  COALESCE(pe.risk_score, 0) * 2 + 
  CASE pb.severity 
    WHEN 'critical' THEN 100
    WHEN 'high' THEN 50
    WHEN 'medium' THEN 20
    ELSE 5
  END AS priority_score
FROM playbook_executions pe
JOIN playbooks pb ON pb.id = pe.playbook_id
LEFT JOIN agents a ON a.id = pe.agent_id
WHERE pe.status = 'pending'

UNION ALL

-- Source 2: Unresolved Critical System Alerts
SELECT 
  sa.id AS item_id,
  'alert' AS source_type,
  sa.tenant_id,
  sa.agent_id,
  a.agent_name,
  a.hostname,
  sa.title,
  sa.message AS description,
  sa.severity,
  NULL::integer AS risk_score,
  'pending' AS action_status,
  NULL AS execution_mode,
  sa.details AS context,
  sa.created_at,
  sa.alert_type AS trigger_type,
  NULL::uuid AS playbook_id,
  -- Priority based on severity and age
  CASE sa.severity 
    WHEN 'critical' THEN 100
    WHEN 'high' THEN 50
    WHEN 'medium' THEN 20
    ELSE 5
  END +
  EXTRACT(EPOCH FROM (now() - sa.created_at)) / 3600 AS priority_score
FROM system_alerts sa
LEFT JOIN agents a ON a.id = sa.agent_id
WHERE sa.resolved = false
  AND sa.severity IN ('critical', 'high')

UNION ALL

-- Source 3: Agents offline with suspicious circumstances
SELECT 
  a.id AS item_id,
  'agent_offline' AS source_type,
  a.tenant_id,
  a.id AS agent_id,
  a.agent_name,
  a.hostname,
  'Computador offline de forma inesperada' AS title,
  CASE 
    WHEN a.offline_reason LIKE '%crash%' THEN 'Este computador parou de responder de forma inesperada e pode indicar problema grave.'
    ELSE 'Este computador esta offline e pode necessitar de atencao.'
  END AS description,
  CASE 
    WHEN a.offline_reason LIKE '%crash%' THEN 'high'
    WHEN EXTRACT(EPOCH FROM (now() - a.offline_detected_at)) / 3600 > 24 THEN 'medium'
    ELSE 'low'
  END AS severity,
  NULL::integer AS risk_score,
  'pending' AS action_status,
  NULL AS execution_mode,
  jsonb_build_object(
    'offline_reason', a.offline_reason,
    'hours_offline', ROUND(EXTRACT(EPOCH FROM (now() - a.offline_detected_at)) / 3600, 1),
    'last_heartbeat', a.last_heartbeat
  ) AS context,
  a.offline_detected_at AS created_at,
  'agent_offline' AS trigger_type,
  NULL::uuid AS playbook_id,
  -- Priority: crash is urgent, long offline is medium
  CASE 
    WHEN a.offline_reason LIKE '%crash%' THEN 80
    ELSE 30
  END +
  LEAST(EXTRACT(EPOCH FROM (now() - a.offline_detected_at)) / 3600, 48) AS priority_score
FROM agents a
WHERE a.status = 'offline'
  AND a.offline_detected_at IS NOT NULL
  AND a.offline_detected_at > now() - INTERVAL '7 days';

-- Grant permissions
GRANT SELECT ON public.v_action_center TO authenticated;
GRANT SELECT ON public.v_action_center TO service_role;

-- =============================================================================
-- RPC Function: get_action_center_feed
-- Returns prioritized action items grouped by urgency
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_action_center_feed(p_tenant_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  urgent_items jsonb;
  recommended_items jsonb;
  informational_items jsonb;
  healthy_count integer;
BEGIN
  -- Urgent: critical/high severity or priority_score >= 70
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'source_type', source_type,
      'agent_id', agent_id,
      'agent_name', agent_name,
      'hostname', hostname,
      'title', title,
      'description', description,
      'severity', severity,
      'risk_score', risk_score,
      'context', context,
      'created_at', created_at,
      'trigger_type', trigger_type,
      'playbook_id', playbook_id,
      'priority_score', priority_score
    ) ORDER BY priority_score DESC
  ), '[]'::jsonb)
  INTO urgent_items
  FROM v_action_center
  WHERE tenant_id = p_tenant_id
    AND (severity IN ('critical', 'high') OR priority_score >= 70);

  -- Recommended: medium severity or priority_score between 30-70
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'source_type', source_type,
      'agent_id', agent_id,
      'agent_name', agent_name,
      'hostname', hostname,
      'title', title,
      'description', description,
      'severity', severity,
      'risk_score', risk_score,
      'context', context,
      'created_at', created_at,
      'trigger_type', trigger_type,
      'playbook_id', playbook_id,
      'priority_score', priority_score
    ) ORDER BY priority_score DESC
  ), '[]'::jsonb)
  INTO recommended_items
  FROM v_action_center
  WHERE tenant_id = p_tenant_id
    AND severity NOT IN ('critical', 'high')
    AND priority_score >= 30
    AND priority_score < 70;

  -- Informational: low priority items
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_id', item_id,
      'source_type', source_type,
      'agent_id', agent_id,
      'agent_name', agent_name,
      'hostname', hostname,
      'title', title,
      'description', description,
      'severity', severity,
      'risk_score', risk_score,
      'context', context,
      'created_at', created_at,
      'trigger_type', trigger_type,
      'playbook_id', playbook_id,
      'priority_score', priority_score
    ) ORDER BY priority_score DESC
  ), '[]'::jsonb)
  INTO informational_items
  FROM v_action_center
  WHERE tenant_id = p_tenant_id
    AND priority_score < 30;

  -- Count healthy agents (online, no issues)
  SELECT COUNT(*)
  INTO healthy_count
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND status = 'online'
    AND agent_state = 'healthy';

  -- Build final result
  result := jsonb_build_object(
    'urgent', urgent_items,
    'recommended', recommended_items,
    'informational', informational_items,
    'healthy_count', healthy_count,
    'generated_at', now()
  );

  RETURN result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_action_center_feed(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_action_center_feed(UUID) TO service_role;