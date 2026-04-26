-- Fix: validate_job_agent_name should also match by hostname
-- This resolves the ghost agent errors where machines send hostname
-- but agent_name was renamed post-reinstallation
CREATE OR REPLACE FUNCTION validate_job_agent_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  -- First try matching by agent_name
  SELECT id INTO v_agent_id
  FROM public.agents
  WHERE agent_name = NEW.agent_name
    AND tenant_id = NEW.tenant_id
  LIMIT 1;
  
  -- If not found by agent_name, try matching by hostname
  IF v_agent_id IS NULL THEN
    SELECT id INTO v_agent_id
    FROM public.agents
    WHERE hostname = NEW.agent_name
      AND tenant_id = NEW.tenant_id
    LIMIT 1;
    
    -- If found by hostname, update agent_name to the registered name
    IF v_agent_id IS NOT NULL THEN
      NEW.agent_name := (SELECT agent_name FROM public.agents WHERE id = v_agent_id);
    END IF;
  END IF;
  
  -- If still not found, block INSERT
  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Invalid agent_name: "%" does not exist in tenant %', 
      NEW.agent_name, NEW.tenant_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  
  -- Auto-fill agent_id if NULL
  IF NEW.agent_id IS NULL THEN
    NEW.agent_id := v_agent_id;
  END IF;
  
  RETURN NEW;
END;
$$;