
-- Auto-unpause scheduling when agent updates to the latest version
-- Prevents stale scheduling_paused flags like the PC-Servidor-Planalto case

CREATE OR REPLACE FUNCTION public.trg_auto_unpause_on_version_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when agent_version actually changes
  IF OLD.agent_version IS DISTINCT FROM NEW.agent_version
     AND NEW.scheduling_paused = true
     AND NEW.agent_version IS NOT NULL
  THEN
    -- Check if the new version matches the latest for this platform
    IF EXISTS (
      SELECT 1 FROM agent_versions
      WHERE is_latest = true
        AND platform = NEW.os_type
        AND version = NEW.agent_version
    ) THEN
      NEW.scheduling_paused := false;
      NEW.scheduling_paused_reason := NULL;
      RAISE NOTICE 'Auto-unpaused scheduling for agent % (updated to %)', NEW.agent_name, NEW.agent_version;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Attach trigger (drop first to be idempotent)
DROP TRIGGER IF EXISTS trg_auto_unpause_on_version_update ON agents;
CREATE TRIGGER trg_auto_unpause_on_version_update
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_unpause_on_version_update();
