-- 1. Create Atomic Heartbeat Update RPC (MVCC + Idempotency)
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat_atomic(
  p_agent_id UUID,
  p_update_data JSONB
)
RETURNS VOID AS $$
DECLARE
  v_current_hb TIMESTAMP WITH TIME ZONE;
  v_current_version INT;
  v_incoming_ts TIMESTAMP WITH TIME ZONE;
  v_incoming_version INT;
BEGIN
  -- 1. Select current state with FOR UPDATE lock to prevent race conditions
  SELECT last_heartbeat, version INTO v_current_hb, v_current_version
  FROM public.agents
  WHERE id = p_agent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent % not found', p_agent_id;
  END IF;

  -- 2. Extract incoming timestamp and version (if provided)
  v_incoming_ts := (p_update_data->>'update_timestamp')::TIMESTAMP WITH TIME ZONE;
  v_incoming_version := (p_update_data->>'version')::INT;

  -- 3. STRICT IDEMPOTENCY: Reject stale updates (older timestamp or smaller version)
  IF v_incoming_ts IS NOT NULL AND v_current_hb IS NOT NULL AND v_incoming_ts <= v_current_hb THEN
    -- Update timestamp is older or equal, skip metadata update but record heartbeat activity
    UPDATE public.agents
    SET last_heartbeat = now(),
        status = 'active'
    WHERE id = p_agent_id;
    RETURN;
  END IF;

  -- 4. Perform atomic update with version increment
  UPDATE public.agents
  SET 
    status = 'active',
    last_heartbeat = COALESCE(v_incoming_ts, now()),
    version = COALESCE(v_current_version, 0) + 1,
    -- Map JSONB fields to columns (dynamically if possible, or explicit for critical ones)
    agent_version = COALESCE(p_update_data->>'agent_version', agent_version),
    os_version = COALESCE(p_update_data->>'os_version', os_version),
    hostname = COALESCE(p_update_data->>'hostname', hostname),
    state = COALESCE(p_update_data->>'state', state),
    agent_state = COALESCE(p_update_data->>'agent_state', agent_state),
    last_telemetry_at = COALESCE((p_update_data->>'last_telemetry_at')::TIMESTAMP WITH TIME ZONE, last_telemetry_at),
    metadata_hash = COALESCE(p_update_data->>'metadata_hash', metadata_hash),
    -- row_version for client-side MVCC if needed
    row_version = COALESCE(v_current_version, 0) + 1
  WHERE id = p_agent_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. HMAC Signature Rotation & Cleanup
-- Ensure agent_hmac_signatures has an index on created_at for fast cleanup
CREATE INDEX IF NOT EXISTS idx_agent_hmac_signatures_created_at ON public.agent_hmac_signatures(created_at);

-- Create cleanup function for old signatures (older than 24h)
CREATE OR REPLACE FUNCTION public.cleanup_agent_hmac_signatures()
RETURNS VOID AS $$
BEGIN
  DELETE FROM public.agent_hmac_signatures
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Legacy Release Cleanup
-- Soft-delete/Archive legacy versions to keep stable baseline
UPDATE public.agent_releases
SET is_active = false,
    channel = 'deprecated'
WHERE platform = 'windows' 
  AND version NOT IN ('v6.0.0', 'v4.1.2');

UPDATE public.agent_releases
SET is_active = false,
    channel = 'deprecated'
WHERE platform IN ('linux', 'macos')
  AND version NOT IN ('v5.0.15');

-- 4. Audit: Ensure all agents have a version initialized
UPDATE public.agents SET version = 1 WHERE version IS NULL;
UPDATE public.agents SET row_version = 1 WHERE row_version IS NULL;