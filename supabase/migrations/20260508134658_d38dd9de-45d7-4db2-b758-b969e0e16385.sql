-- 1. Add versioning to agents table
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1;

-- 2. Update the atomic heartbeat RPC with MVCC and temporal idempotency
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat_atomic(
  p_agent_id UUID,
  p_update_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_heartbeat TIMESTAMPTZ;
  v_incoming_telemetry_at TIMESTAMPTZ;
BEGIN
  -- 1. Parse incoming telemetry timestamp if present
  v_incoming_telemetry_at := (p_update_data->>'last_telemetry_at')::TIMESTAMPTZ;

  -- 2. Acquire an exclusive lock on the specific agent row
  SELECT last_heartbeat INTO v_current_heartbeat
  FROM public.agents
  WHERE id = p_agent_id
  FOR UPDATE;

  -- 3. Temporal Idempotency Check: 
  -- If we have an incoming telemetry timestamp and it's older than what we already recorded,
  -- we only update the heartbeat (online status) but skip overwriting metadata/telemetry.
  -- This prevents out-of-order heartbeats from corrupting state.
  
  UPDATE public.agents
  SET 
    status = 'active',
    last_heartbeat = now(),
    row_version = row_version + 1, -- MVCC Increment
    
    -- Conditional metadata updates (only if incoming data isn't older than current telemetry)
    os_type = CASE 
      WHEN v_incoming_telemetry_at IS NULL OR last_telemetry_at IS NULL OR v_incoming_telemetry_at >= last_telemetry_at 
      THEN COALESCE((p_update_data->>'os_type'), os_type) 
      ELSE os_type 
    END,
    os_version = CASE 
      WHEN v_incoming_telemetry_at IS NULL OR last_telemetry_at IS NULL OR v_incoming_telemetry_at >= last_telemetry_at 
      THEN COALESCE((p_update_data->>'os_version'), os_version) 
      ELSE os_version 
    END,
    hostname = CASE 
      WHEN v_incoming_telemetry_at IS NULL OR last_telemetry_at IS NULL OR v_incoming_telemetry_at >= last_telemetry_at 
      THEN COALESCE((p_update_data->>'hostname'), hostname) 
      ELSE hostname 
    END,
    agent_version = CASE 
      WHEN v_incoming_telemetry_at IS NULL OR last_telemetry_at IS NULL OR v_incoming_telemetry_at >= last_telemetry_at 
      THEN COALESCE((p_update_data->>'agent_version'), agent_version) 
      ELSE agent_version 
    END,
    agent_state = CASE 
      WHEN v_incoming_telemetry_at IS NULL OR last_telemetry_at IS NULL OR v_incoming_telemetry_at >= last_telemetry_at 
      THEN COALESCE((p_update_data->>'agent_state'), agent_state) 
      ELSE agent_state 
    END,
    state = CASE 
      WHEN v_incoming_telemetry_at IS NULL OR last_telemetry_at IS NULL OR v_incoming_telemetry_at >= last_telemetry_at 
      THEN COALESCE((p_update_data->>'state'), state) 
      ELSE state 
    END,
    
    -- Always update last_telemetry_at if it's newer
    last_telemetry_at = GREATEST(v_incoming_telemetry_at, last_telemetry_at),
    
    -- Capabilities & Security
    ed25519_supported = COALESCE((p_update_data->>'ed25519_supported')::BOOLEAN, ed25519_supported),
    signature_mode = COALESCE((p_update_data->>'signature_mode'), signature_mode),
    
    -- Maintenance & Updates
    skip_firewall_remediation = COALESCE((p_update_data->>'skip_firewall_remediation')::BOOLEAN, skip_firewall_remediation),
    force_update_delivered_count = COALESCE((p_update_data->>'force_update_delivered_count')::INTEGER, force_update_delivered_count),
    force_update_first_delivered_at = COALESCE((p_update_data->>'force_update_first_delivered_at')::TIMESTAMPTZ, force_update_first_delivered_at),
    last_forced_update_applied = COALESCE((p_update_data->>'last_forced_update_applied')::TIMESTAMPTZ, last_forced_update_applied)
  WHERE id = p_agent_id;
END;
$$;

-- 4. signature rotation and cleanup
-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_agent_hmac_signatures_created_at ON public.agent_hmac_signatures(created_at);

-- Cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remove signatures older than 24 hours (configurable based on agent check-in frequency)
  -- This reduces storage and keeps index scans fast.
  DELETE FROM public.agent_hmac_signatures
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;
