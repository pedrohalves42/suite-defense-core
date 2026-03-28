-- Add agent_state columns for explicit state machine
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS agent_state text NOT NULL DEFAULT 'offline',
ADD COLUMN IF NOT EXISTS agent_state_reason text,
ADD COLUMN IF NOT EXISTS agent_state_changed_at timestamptz DEFAULT now();

-- Create index for fast queries by state
CREATE INDEX IF NOT EXISTS idx_agents_state ON agents(agent_state);
CREATE INDEX IF NOT EXISTS idx_agents_state_tenant ON agents(tenant_id, agent_state);

-- Trigger function to auto-derive agent_state from existing flags
CREATE OR REPLACE FUNCTION derive_agent_state_trigger()
RETURNS TRIGGER AS $$
DECLARE
  old_state text;
  new_state text;
  minutes_since_heartbeat numeric;
BEGIN
  old_state := OLD.agent_state;
  
  -- Calculate minutes since last heartbeat
  IF NEW.last_heartbeat IS NOT NULL THEN
    minutes_since_heartbeat := EXTRACT(EPOCH FROM (now() - NEW.last_heartbeat)) / 60;
  ELSE
    minutes_since_heartbeat := NULL;
  END IF;

  -- Derive state with priority order (security first)
  IF NEW.is_isolated = true THEN
    new_state := 'isolated';
  ELSIF NEW.safe_mode_reason IS NOT NULL AND NEW.safe_mode_entered_at IS NOT NULL THEN
    new_state := 'safe_mode';
  ELSIF minutes_since_heartbeat IS NOT NULL AND minutes_since_heartbeat > 10 THEN
    new_state := 'offline';
  ELSIF NEW.status = 'pending' AND NEW.last_heartbeat IS NULL THEN
    new_state := 'offline';
  ELSIF NEW.force_update_version IS NOT NULL AND NEW.force_update_at IS NOT NULL 
        AND EXTRACT(EPOCH FROM (now() - NEW.force_update_at)) / 60 < 30 THEN
    new_state := 'updating';
  ELSIF NEW.is_throttled = true THEN
    new_state := 'degraded';
  ELSIF NEW.status = 'active' THEN
    new_state := 'healthy';
  ELSE
    new_state := 'offline';
  END IF;

  NEW.agent_state := new_state;
  
  -- Update timestamp only if state actually changed
  IF old_state IS DISTINCT FROM new_state THEN
    NEW.agent_state_changed_at := now();
    
    -- Set reason based on new state
    CASE new_state
      WHEN 'isolated' THEN
        NEW.agent_state_reason := COALESCE(NEW.isolation_reason, 'Isolado por seguranca');
      WHEN 'safe_mode' THEN
        NEW.agent_state_reason := COALESCE(NEW.safe_mode_reason, 'Modo de protecao ativo');
      WHEN 'degraded' THEN
        NEW.agent_state_reason := COALESCE(NEW.throttle_reason, 'Comunicacao restrita');
      WHEN 'updating' THEN
        NEW.agent_state_reason := 'Atualizando para versao ' || COALESCE(NEW.force_update_version, 'desconhecida');
      WHEN 'offline' THEN
        NEW.agent_state_reason := 'Sem contato';
      WHEN 'healthy' THEN
        NEW.agent_state_reason := NULL;
      ELSE
        NEW.agent_state_reason := NULL;
    END CASE;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS agent_state_derivation ON agents;
CREATE TRIGGER agent_state_derivation
BEFORE UPDATE ON agents
FOR EACH ROW EXECUTE FUNCTION derive_agent_state_trigger();

-- Update all existing agents with derived state
UPDATE agents SET 
  agent_state = CASE
    WHEN is_isolated = true THEN 'isolated'
    WHEN safe_mode_reason IS NOT NULL AND safe_mode_entered_at IS NOT NULL THEN 'safe_mode'
    WHEN last_heartbeat IS NULL THEN 'offline'
    WHEN EXTRACT(EPOCH FROM (now() - last_heartbeat)) / 60 > 10 THEN 'offline'
    WHEN force_update_version IS NOT NULL AND force_update_at IS NOT NULL 
         AND EXTRACT(EPOCH FROM (now() - force_update_at)) / 60 < 30 THEN 'updating'
    WHEN is_throttled = true THEN 'degraded'
    WHEN status = 'active' THEN 'healthy'
    ELSE 'offline'
  END,
  agent_state_changed_at = now()
WHERE true;