
-- Fix create_jobs_for_all_agents to use dedup guard
CREATE OR REPLACE FUNCTION public.create_jobs_for_all_agents(
  p_tenant_id uuid,
  p_job_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_agent RECORD;
  v_new_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;
  
  FOR v_agent IN
    SELECT id, agent_name 
    FROM agents 
    WHERE tenant_id = p_tenant_id 
      AND archived_at IS NULL
      AND status = 'active'
      AND last_heartbeat > NOW() - INTERVAL '5 minutes'
  LOOP
    -- Use dedup guard instead of raw INSERT
    SELECT create_job_if_not_exists(
      v_agent.id, p_tenant_id, p_job_type, p_payload, 5, 1
    ) INTO v_new_id;
    
    IF v_new_id IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_count;
END;
$$;
