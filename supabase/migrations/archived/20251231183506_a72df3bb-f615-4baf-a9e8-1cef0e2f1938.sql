-- Fix validate_audit_trail_integrity RPC: remove reference to non-existent decision_events.insight_id
CREATE OR REPLACE FUNCTION public.validate_audit_trail_integrity(p_tenant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'orphan_actions', (
      SELECT COALESCE(json_agg(json_build_object('id', id, 'action_type', action_type, 'created_at', created_at)), '[]'::json)
      FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND insight_id IS NULL
      LIMIT 10
    ),
    'orphan_actions_count', (
      SELECT COUNT(*) FROM ai_actions 
      WHERE tenant_id = p_tenant_id AND insight_id IS NULL
    ),
    'executions_without_audit', (
      SELECT COUNT(*) FROM ai_action_executions e
      WHERE e.tenant_id = p_tenant_id 
      AND NOT EXISTS (
        SELECT 1 FROM audit_logs a 
        WHERE a.resource_id = e.id::text 
        AND a.resource_type = 'ai_action_execution'
      )
    ),
    -- FIXED: decision_events doesn't have insight_id, count orphan events without rule_code instead
    'decisions_without_rule', (
      SELECT COUNT(*) FROM decision_events d
      WHERE d.tenant_id = p_tenant_id 
      AND d.rule_code IS NULL
    ),
    'integrity_score', (
      SELECT CASE 
        WHEN (
          SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id
        ) = 0 THEN 100
        ELSE ROUND(
          (1 - (
            SELECT COUNT(*)::NUMERIC FROM ai_actions 
            WHERE tenant_id = p_tenant_id AND insight_id IS NULL
          ) / NULLIF((
            SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id
          ), 1)) * 100, 2
        )
      END
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$function$;