DROP FUNCTION IF EXISTS public.update_agent_heartbeat_atomic(UUID, JSONB);

-- Atomic heartbeat update function
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat_atomic(
    p_agent_id UUID,
    p_update_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
DECLARE
    v_now TIMESTAMP WITH TIME ZONE := NOW();
    v_agent RECORD;
    v_new_version INTEGER;
BEGIN
    -- 1. Lock agent row for update
    SELECT * INTO v_agent FROM public.agents WHERE id = p_agent_id FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'AGENT_NOT_FOUND');
    END IF;

    -- 2. Version increment
    v_new_version := COALESCE(v_agent.version, 0) + 1;

    -- 3. Perform the update
    UPDATE public.agents SET
        status = 'active',
        agent_state = COALESCE(p_update_data->>'agent_state', agent_state),
        state = COALESCE(p_update_data->>'state', state),
        last_heartbeat = v_now,
        last_telemetry_at = COALESCE((p_update_data->>'last_telemetry_at')::TIMESTAMP WITH TIME ZONE, last_telemetry_at),
        version = v_new_version,
        updated_at = v_now,
        os_type = COALESCE(p_update_data->>'os_type', os_type),
        os_version = COALESCE(p_update_data->>'os_version', os_version),
        hostname = COALESCE(p_update_data->>'hostname', hostname),
        agent_version = COALESCE(p_update_data->>'agent_version', agent_version),
        ed25519_supported = COALESCE((p_update_data->>'ed25519_supported')::BOOLEAN, ed25519_supported),
        signature_mode = COALESCE(p_update_data->>'signature_mode', signature_mode)
    WHERE id = p_agent_id;

    RETURN jsonb_build_object(
        'success', true,
        'agent_id', p_agent_id,
        'new_version', v_new_version,
        'updated_at', v_now
    );
END;
$$;

-- Grant access to service_role
GRANT EXECUTE ON FUNCTION public.update_agent_heartbeat_atomic(UUID, JSONB) TO service_role;
