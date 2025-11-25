-- ============================================================
-- P0 SECURITY FIXES - Part 2
-- Fix search_path for SECURITY INVOKER functions
-- ============================================================

-- Add SET search_path to get_problematic_agents
CREATE OR REPLACE FUNCTION public.get_problematic_agents(p_tenant_id uuid)
RETURNS TABLE(
    id uuid,
    agent_name text,
    status text,
    created_at timestamp with time zone,
    minutes_since_creation numeric,
    installation_success boolean,
    network_connectivity boolean,
    metadata jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
      AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'Access denied: user does not belong to tenant %', p_tenant_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name,
    a.status,
    a.enrolled_at AS created_at,
    EXTRACT(EPOCH FROM (NOW() - a.enrolled_at))::numeric / 60 AS minutes_since_creation,
    ia.success AS installation_success,
    ia.network_connectivity,
    ia.metadata
  FROM agents a
  LEFT JOIN LATERAL (
    SELECT success, network_connectivity, metadata
    FROM installation_analytics
    WHERE agent_id = a.id
      AND event_type = 'post_installation'
    ORDER BY created_at DESC
    LIMIT 1
  ) ia ON true
  WHERE a.status = 'pending'
    AND a.last_heartbeat IS NULL
    AND a.enrolled_at < NOW() - INTERVAL '5 minutes'
    AND a.tenant_id = p_tenant_id
  ORDER BY a.enrolled_at DESC;
END;
$$;

-- Add SET search_path to diagnose_agent
CREATE OR REPLACE FUNCTION public.diagnose_agent(p_agent_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_token_info RECORD;
  v_jobs_info RECORD;
  v_issues jsonb[] := '{}';
  v_user_tenant_id uuid;
BEGIN
  SELECT tenant_id INTO v_user_tenant_id 
  FROM user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;
  
  IF v_user_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User not authenticated or no tenant assigned'
    );
  END IF;

  SELECT * INTO v_agent
  FROM agents
  WHERE agent_name = p_agent_name
    AND tenant_id = v_user_tenant_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Agent not found in your tenant',
      'agent_name', p_agent_name
    );
  END IF;
  
  SELECT 
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
    MAX(created_at) as last_token_created
  INTO v_token_info
  FROM agent_tokens
  WHERE agent_id = v_agent.id;
  
  IF v_token_info.active_tokens = 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'no_active_token',
      'severity', 'critical',
      'message', 'No active tokens found for this agent'
    );
  END IF;
  
  IF v_agent.last_heartbeat IS NULL THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'never_connected',
      'severity', 'critical',
      'message', 'Agent never sent a heartbeat',
      'enrolled_at', v_agent.enrolled_at
    );
  ELSIF v_agent.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'stale_heartbeat',
      'severity', 'high',
      'message', 'Last heartbeat was more than 10 minutes ago',
      'last_heartbeat', v_agent.last_heartbeat,
      'minutes_ago', EXTRACT(EPOCH FROM (NOW() - v_agent.last_heartbeat)) / 60
    );
  END IF;
  
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'queued') as queued_jobs,
    COUNT(*) FILTER (WHERE status = 'delivered') as delivered_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs
  INTO v_jobs_info
  FROM jobs
  WHERE agent_id = v_agent.id;
  
  IF v_jobs_info.delivered_jobs > 0 THEN
    v_issues := v_issues || jsonb_build_object(
      'type', 'stuck_jobs',
      'severity', 'medium',
      'message', format('%s jobs stuck in delivered state', v_jobs_info.delivered_jobs)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'agent', jsonb_build_object(
      'id', v_agent.id,
      'name', v_agent.agent_name,
      'status', v_agent.status,
      'enrolled_at', v_agent.enrolled_at,
      'last_heartbeat', v_agent.last_heartbeat,
      'os_type', v_agent.os_type
    ),
    'tokens', v_token_info,
    'jobs', v_jobs_info,
    'issues', v_issues,
    'is_healthy', array_length(v_issues, 1) IS NULL
  );
END;
$$;