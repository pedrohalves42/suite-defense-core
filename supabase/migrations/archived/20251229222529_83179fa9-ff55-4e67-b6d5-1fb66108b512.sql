-- Fix security: Set search_path for the trigger function
CREATE OR REPLACE FUNCTION derive_agent_state_trigger()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
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