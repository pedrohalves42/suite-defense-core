
-- Fix 1: Improve auto-pause trigger to consider agent_state = 'offline'
CREATE OR REPLACE FUNCTION public.auto_pause_scheduling()
RETURNS TRIGGER AS $$
BEGIN
  -- Agent transitioning TO inactive status
  IF NEW.status = 'inactive' AND OLD.status != 'inactive' THEN
    NEW.scheduling_paused := true;
    NEW.scheduling_paused_reason := 'auto: agent went inactive at ' || now()::text;
  END IF;

  -- Agent transitioning FROM inactive to active (resume)
  IF NEW.status = 'active' AND OLD.status = 'inactive' THEN
    NEW.scheduling_paused := false;
    NEW.scheduling_paused_reason := null;
  END IF;

  -- Agent_state going offline while status is still active ? pause scheduling
  IF NEW.agent_state = 'offline' AND (OLD.agent_state IS DISTINCT FROM 'offline') THEN
    NEW.scheduling_paused := true;
    NEW.scheduling_paused_reason := 'auto: agent_state went offline at ' || now()::text;
  END IF;

  -- Agent_state recovering from offline ? resume scheduling
  IF OLD.agent_state = 'offline' AND NEW.agent_state != 'offline' THEN
    NEW.scheduling_paused := false;
    NEW.scheduling_paused_reason := null;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Fix 2: Clear stale force_update_version for agents already on that version
UPDATE agents
SET force_update_version = null,
    force_update_reason = null,
    force_update_at = null
WHERE force_update_version IS NOT NULL
  AND agent_version = force_update_version;
