-- Clear force_update flags and reset DEGRADED state for agents stuck in the TOCTOU loop
UPDATE public.agents
SET 
  force_update_version = NULL,
  force_update_reason = NULL,
  force_update_at = NULL,
  force_update_delivered_count = 0,
  force_update_first_delivered_at = NULL,
  force_update_override_safe_mode = false,
  force_update_override_safe_mode_expires_at = NULL,
  state = 'ENFORCING'
WHERE archived_at IS NULL 
  AND state = 'DEGRADED'
  AND last_forced_update_applied > NOW() - INTERVAL '24 hours';