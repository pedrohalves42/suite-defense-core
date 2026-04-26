-- Drop existing constraint and add expanded one with new decision types
ALTER TABLE decision_events DROP CONSTRAINT IF EXISTS decision_events_decision_type_check;

ALTER TABLE decision_events ADD CONSTRAINT decision_events_decision_type_check 
CHECK (
  decision_type IS NULL OR 
  decision_type = ANY (ARRAY[
    'approval',
    'rejection', 
    'escalation',
    'system',
    'alert_resolution',
    'alert_reopen',
    'compensating_action',
    'rollback',
    'safe_mode_release',
    'validation'
  ])
);

-- Update get_audit_raw_metrics function with governance metrics
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- Existing metrics
    'agents_total', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id),
    'agents_active', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status = 'active'),
    'agents_offline', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status = 'offline'),
    'agents_isolated', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND is_isolated = true),
    'agents_version_current', (
      SELECT COUNT(*) FROM agents a
      WHERE a.tenant_id = p_tenant_id
      AND a.agent_version = (SELECT version FROM agent_releases WHERE is_active = true AND channel = 'stable' ORDER BY created_at DESC LIMIT 1)
    ),
    
    -- Safe mode metrics
    'safe_mode_events_30d', (
      SELECT COUNT(*) FROM agent_safe_mode_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'safe_mode_active', (
      SELECT COUNT(*) FROM agent_safe_mode_events 
      WHERE tenant_id = p_tenant_id 
      AND resolved_at IS NULL
    ),
    'safe_mode_resolved_human', (
      SELECT COUNT(*) FROM agent_safe_mode_events 
      WHERE tenant_id = p_tenant_id 
      AND resolved_by IS NOT NULL
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'safe_mode_human_resolution_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE resolved_by IS NOT NULL)::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM agent_safe_mode_events 
      WHERE tenant_id = p_tenant_id
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Rollback metrics
    'rollback_events_30d', (
      SELECT COUNT(*) FROM agent_rollback_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'rollback_safe_mode_triggered', (
      SELECT COUNT(*) FROM agent_rollback_events 
      WHERE tenant_id = p_tenant_id 
      AND safe_mode_triggered = true
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Decision events metrics
    'decision_events_total', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'decision_events_human', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND decision_source = 'human'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'decision_events_ai', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND decision_source = 'ai'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Rollback decision metrics (NEW)
    'rollback_decisions_total', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND decision_type = 'rollback'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'rollback_decisions_human', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND decision_type = 'rollback' 
      AND decision_source = 'human'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'rollback_human_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE decision_source = 'human')::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND decision_type = 'rollback'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Safe mode release decisions (NEW)
    'safe_mode_release_decisions', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND decision_type = 'safe_mode_release'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Validation decisions (NEW)
    'validation_decisions', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND decision_type = 'validation'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Rollback correlation rate (NEW)
    'rollback_correlation_rate', (
      SELECT CASE 
        WHEN (SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days') = 0 THEN 100
        ELSE ROUND(
          LEAST(
            (SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND decision_type = 'rollback' AND created_at > NOW() - INTERVAL '30 days')::numeric /
            NULLIF((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days'), 0)::numeric * 100,
            100
          ), 2
        )
      END
    ),
    
    -- Agent groups metrics (NEW)
    'agent_groups_total', (SELECT COUNT(*) FROM agent_groups WHERE tenant_id = p_tenant_id),
    'agent_groups_with_policies', (
      SELECT COUNT(DISTINCT ag.id) 
      FROM agent_groups ag
      JOIN agent_group_policies agp ON agp.group_id = ag.id
      WHERE ag.tenant_id = p_tenant_id
    ),
    
    -- Policies metrics
    'policies_total', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
    'policies_active', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'policies_assigned', (
      SELECT COUNT(DISTINCT sp.id) 
      FROM security_policies sp
      JOIN agent_group_policies agp ON agp.policy_id = sp.id
      WHERE sp.tenant_id = p_tenant_id AND sp.is_active = true
    ),
    'policies_orphaned', (
      SELECT COUNT(*) 
      FROM security_policies sp
      LEFT JOIN agent_group_policies agp ON agp.policy_id = sp.id
      WHERE sp.tenant_id = p_tenant_id 
      AND sp.is_active = true 
      AND agp.id IS NULL
    ),
    
    -- Alerts metrics
    'alerts_total_30d', (
      SELECT COUNT(*) FROM system_alerts 
      WHERE tenant_id = p_tenant_id
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'alerts_critical_30d', (
      SELECT COUNT(*) FROM system_alerts 
      WHERE tenant_id = p_tenant_id 
      AND severity = 'critical'
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'alerts_resolved_30d', (
      SELECT COUNT(*) FROM system_alerts 
      WHERE tenant_id = p_tenant_id 
      AND resolved = true
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'alerts_human_reviewed', (
      SELECT COUNT(*) FROM system_alerts 
      WHERE tenant_id = p_tenant_id 
      AND human_reviewed = true
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'alerts_critical_human_reviewed', (
      SELECT COUNT(*) FROM system_alerts 
      WHERE tenant_id = p_tenant_id 
      AND severity = 'critical'
      AND human_reviewed = true
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Jobs metrics
    'jobs_total_24h', (
      SELECT COUNT(*) FROM jobs 
      WHERE tenant_id = p_tenant_id
      AND created_at > NOW() - INTERVAL '24 hours'
    ),
    'jobs_completed_24h', (
      SELECT COUNT(*) FROM jobs 
      WHERE tenant_id = p_tenant_id 
      AND status = 'completed'
      AND created_at > NOW() - INTERVAL '24 hours'
    ),
    'jobs_failed_24h', (
      SELECT COUNT(*) FROM jobs 
      WHERE tenant_id = p_tenant_id 
      AND status = 'failed'
      AND created_at > NOW() - INTERVAL '24 hours'
    ),
    
    -- Timestamp
    'generated_at', NOW()
  ) INTO result;
  
  RETURN result;
END;
$function$;