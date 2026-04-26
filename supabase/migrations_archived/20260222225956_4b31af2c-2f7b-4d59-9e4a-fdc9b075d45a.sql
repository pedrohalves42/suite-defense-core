
-- Fix V-001: Correct auto_provision_signing_key to match actual schema
-- agent_signing_keys doesn't have tenant_id or is_active columns
CREATE OR REPLACE FUNCTION public.auto_provision_signing_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO agent_signing_keys (agent_id, public_key, algorithm, version)
    SELECT NEW.id, 'pending-agent-upload', 'ECDSA-P256', 1
    WHERE NOT EXISTS (
      SELECT 1 FROM agent_signing_keys WHERE agent_id = NEW.id AND revoked_at IS NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Fix V-004: Correct auto_create_evidence_from_execution  
-- Use correct column references
CREATE OR REPLACE FUNCTION public.auto_create_evidence_from_execution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_evidence_hash text;
BEGIN
  IF NEW.status NOT IN ('completed', 'failed') THEN
    RETURN NEW;
  END IF;
  
  SELECT id, agent_name, tenant_id, agent_version INTO v_agent
  FROM agents WHERE id = NEW.agent_id;
  
  IF v_agent.id IS NULL THEN
    RETURN NEW;
  END IF;
  
  v_evidence_hash := encode(
    sha256(convert_to(
      COALESCE(NEW.id::text, '') || ':' || COALESCE(NEW.job_id::text, '') || ':' || COALESCE(NEW.status, ''),
      'UTF8'
    )),
    'hex'
  );
  
  INSERT INTO agent_evidence_logs (
    agent_id, agent_name, tenant_id, event_type, 
    event_data, evidence_hash, severity,
    state_before, state_after, agent_version
  ) VALUES (
    v_agent.id,
    v_agent.agent_name,
    v_agent.tenant_id,
    CASE 
      WHEN NEW.status = 'completed' THEN 'job_execution_completed'
      WHEN NEW.status = 'failed' THEN 'job_execution_failed'
    END,
    jsonb_build_object(
      'execution_id', NEW.id,
      'job_id', NEW.job_id,
      'job_type', NEW.job_type,
      'status', NEW.status,
      'duration_ms', EXTRACT(EPOCH FROM (COALESCE(NEW.finished_at, now()) - COALESCE(NEW.started_at, now()))) * 1000,
      'has_output', NEW.output IS NOT NULL
    ),
    v_evidence_hash,
    CASE WHEN NEW.status = 'failed' THEN 'high' ELSE 'info' END,
    'executing',
    NEW.status,
    v_agent.agent_version
  )
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;
