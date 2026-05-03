-- Atomic Heartbeat Update Function
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat_atomic(
  p_agent_id uuid,
  p_update_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_heartbeat timestamptz;
BEGIN
  -- 1. Acquire an exclusive lock on the specific agent row
  -- This prevents concurrent Edge Function instances from creating a Race Condition
  SELECT last_heartbeat INTO v_current_heartbeat
  FROM public.agents
  WHERE id = p_agent_id
  FOR UPDATE;

  -- 2. Perform the update with the guaranteed lock
  UPDATE public.agents
  SET 
    status = 'active',
    last_heartbeat = now(),
    -- Only update columns provided in the jsonb payload
    os_type = COALESCE((p_update_data->>'os_type'), os_type),
    os_version = COALESCE((p_update_data->>'os_version'), os_version),
    hostname = COALESCE((p_update_data->>'hostname'), hostname),
    agent_version = COALESCE((p_update_data->>'agent_version'), agent_version),
    last_telemetry_at = COALESCE((p_update_data->>'last_telemetry_at')::timestamptz, last_telemetry_at),
    skip_firewall_remediation = COALESCE((p_update_data->>'skip_firewall_remediation')::boolean, skip_firewall_remediation),
    force_update_delivered_count = COALESCE((p_update_data->>'force_update_delivered_count')::integer, force_update_delivered_count),
    force_update_first_delivered_at = COALESCE((p_update_data->>'force_update_first_delivered_at')::timestamptz, force_update_first_delivered_at),
    last_forced_update_applied = COALESCE((p_update_data->>'last_forced_update_applied')::timestamptz, last_forced_update_applied)
  WHERE id = p_agent_id;
END;
$$;

-- Revoke public access and grant only to service_role
REVOKE ALL ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(uuid, jsonb) TO service_role;
