-- Phase 3: Fix auto_clear_force_update trigger to only clear on actual version change
-- and re-trigger force update for MIT-SERVIDOR

CREATE OR REPLACE FUNCTION public.auto_clear_force_update_on_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only clear force_update flags when:
  -- 1. There IS a pending force_update (force_update_at is set)
  -- 2. The agent_version ACTUALLY CHANGED in this update
  -- 3. The new version matches the target force_update_version
  IF NEW.force_update_at IS NOT NULL
     AND NEW.force_update_version IS NOT NULL
     AND NEW.agent_version IS DISTINCT FROM OLD.agent_version
     AND NEW.agent_version = NEW.force_update_version
  THEN
    NEW.force_update_version := NULL;
    NEW.force_update_reason := 'auto_cleared_version_matched';
    NEW.force_update_at := NULL;
    NEW.force_update_delivered_count := 0;
    NEW.force_update_first_delivered_at := NULL;
    NEW.force_update_override_safe_mode := false;
    NEW.force_update_override_safe_mode_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Re-trigger force update for MIT-SERVIDOR
UPDATE agents 
SET force_update_version = 'v5.0.13', 
    force_update_at = now(), 
    force_update_reason = 'EMERGENCY: skip_firewall hotfix + baseline dedup via runtime injection',
    force_update_delivered_count = 0,
    force_update_first_delivered_at = NULL
WHERE hostname = 'MIT-SERVIDOR' OR agent_name = 'MIT-SERVIDOR';