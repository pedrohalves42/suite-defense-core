-- 1. Add MVCC versioning to agents table
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- 2. Create atomic heartbeat function
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat_atomic(
  p_agent_id UUID,
  p_update_data JSONB
)
RETURNS void AS $$
DECLARE
  v_current_heartbeat TIMESTAMPTZ;
  v_new_heartbeat TIMESTAMPTZ;
BEGIN
  -- Get current state
  SELECT last_heartbeat INTO v_current_heartbeat
  FROM public.agents
  WHERE id = p_agent_id
  FOR UPDATE; -- Row-level lock

  -- Determine new heartbeat timestamp (fallback to now() if not provided)
  v_new_heartbeat := COALESCE(
    (p_update_data->>'last_telemetry_at')::TIMESTAMPTZ,
    (p_update_data->>'update_timestamp')::TIMESTAMPTZ,
    now()
  );

  -- ONLY update if incoming data is newer or identical (idempotency)
  -- This prevents "lost updates" from out-of-order network packets
  IF v_current_heartbeat IS NULL OR v_new_heartbeat >= v_current_heartbeat THEN
    UPDATE public.agents
    SET 
      status = 'active',
      last_heartbeat = v_new_heartbeat,
      version = version + 1,
      -- Dynamically merge metadata fields from JSONB
      last_ip = COALESCE(p_update_data->>'last_ip', last_ip),
      os_info = COALESCE(p_update_data->'os_info', os_info),
      agent_version = COALESCE(p_update_data->>'agent_version', agent_version),
      hostname = COALESCE(p_update_data->>'hostname', hostname)
    WHERE id = p_agent_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Cleanup logic for agent_hmac_signatures
-- This ensures the replay-protection table doesn't grow indefinitely
CREATE OR REPLACE FUNCTION public.cleanup_expired_hmac_signatures()
RETURNS void AS $$
BEGIN
  DELETE FROM public.agent_hmac_signatures
  WHERE created_at < now() - interval '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a cron job if pg_cron is available (optional, but good for production)
-- SELECT cron.schedule('cleanup-hmac-signatures', '0 0 * * *', 'SELECT cleanup_expired_hmac_signatures()');
