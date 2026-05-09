CREATE OR REPLACE FUNCTION public.update_agent_heartbeat_atomic(
    p_agent_id UUID,
    p_update_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_version INT;
BEGIN
    -- Get current version for optimistic locking inside the atomic function
    SELECT version INTO v_current_version FROM public.agents WHERE id = p_agent_id FOR UPDATE;
    
    UPDATE public.agents
    SET 
        status = 'active',
        last_heartbeat = NOW(),
        version = COALESCE(v_current_version, 0) + 1,
        os_type = COALESCE(p_update_data->>'os_type', os_type),
        os_version = COALESCE(p_update_data->>'os_version', os_version),
        hostname = COALESCE(p_update_data->>'hostname', hostname),
        agent_version = COALESCE(p_update_data->>'agent_version', agent_version),
        agent_state = COALESCE(p_update_data->>'agent_state', agent_state),
        state = COALESCE(p_update_data->>'state', state),
        metadata_hash = COALESCE(p_update_data->>'metadata_hash', metadata_hash),
        ed25519_supported = COALESCE((p_update_data->>'ed25519_supported')::BOOLEAN, ed25519_supported),
        signature_mode = COALESCE(p_update_data->>'signature_mode', signature_mode),
        updated_at = NOW()
    WHERE id = p_agent_id;
END;
$$;