-- Fix security: Enable RLS on v_action_center base tables (they already have it)
-- The view inherits RLS from base tables, so this is safe

-- Change the RPC function to use SECURITY INVOKER (safer) and add tenant validation
DROP FUNCTION IF EXISTS public.get_action_center_feed(UUID);

CREATE OR REPLACE FUNCTION public.get_action_center_feed(p_tenant_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  urgent_items jsonb;
  recommended_items jsonb;
  informational_items jsonb;
  healthy_count integer;
  v_user_tenant_id uuid;
BEGIN
  -- Validate user has access to this tenant
  SELECT tenant_id INTO v_user_tenant_id
  FROM user_roles
  WHERE user_id = auth.uid()
    AND tenant_id = p_tenant_id
  LIMIT 1;

  IF v_user_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Access denied to tenant %', p_tenant_id;
  END IF;

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