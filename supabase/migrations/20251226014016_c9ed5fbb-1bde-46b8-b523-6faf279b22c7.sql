-- =============================================================
-- PROOF OF EXECUTION (PoE) - SCHEMA MIGRATION
-- Phase 1: TTL and signature fields
-- Phase 2: Hash chain support
-- =============================================================

-- =====================
-- PHASE 1: Agent Signing Keys TTL
-- =====================

-- Add expires_at to agent_signing_keys (default 30 days from creation)
ALTER TABLE agent_signing_keys
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Set default for new keys
ALTER TABLE agent_signing_keys
ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days');

-- Backfill existing keys with 30 days from creation
UPDATE agent_signing_keys
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

-- Add rotation tracking
ALTER TABLE agent_signing_keys
ADD COLUMN IF NOT EXISTS rotation_signaled_at TIMESTAMPTZ;

-- =====================
-- PHASE 2: Execution Hash Chain
-- =====================

-- Add hash chain fields to job_executions
ALTER TABLE job_executions
ADD COLUMN IF NOT EXISTS execution_hash TEXT,
ADD COLUMN IF NOT EXISTS previous_execution_hash TEXT,
ADD COLUMN IF NOT EXISTS execution_index BIGINT;

-- Unique constraint on execution chain per agent
CREATE UNIQUE INDEX IF NOT EXISTS uniq_execution_chain 
ON job_executions(agent_id, execution_index)
WHERE execution_index IS NOT NULL;

-- Unique constraint on execution hash
CREATE UNIQUE INDEX IF NOT EXISTS uniq_execution_hash 
ON job_executions(execution_hash)
WHERE execution_hash IS NOT NULL;

-- Index for expired keys detection
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_expires 
ON agent_signing_keys(expires_at) 
WHERE revoked_at IS NULL;

-- =====================
-- PHASE 3: Agent Execution Chain Pointer Table
-- =====================

CREATE TABLE IF NOT EXISTS agent_execution_chain (
  agent_id UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  last_execution_hash TEXT NOT NULL DEFAULT 'GENESIS',
  last_execution_index BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE agent_execution_chain ENABLE ROW LEVEL SECURITY;

-- RLS: Only service role can modify (managed by Edge Functions)
CREATE POLICY "Service role only for execution chain"
ON agent_execution_chain
FOR ALL
USING (false)
WITH CHECK (false);

-- =====================
-- PHASE 4: Sentinel Functions
-- =====================

-- Function to check for expired agent keys
CREATE OR REPLACE FUNCTION check_expired_agent_keys()
RETURNS TABLE(
  expired_count BIGINT,
  agents_affected UUID[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    ARRAY_AGG(DISTINCT ask.agent_id)
  FROM agent_signing_keys ask
  WHERE ask.expires_at < NOW()
    AND ask.revoked_at IS NULL;
END;
$$;

-- Function to detect hash chain breaks
CREATE OR REPLACE FUNCTION detect_chain_breaks()
RETURNS TABLE(
  break_count BIGINT,
  affected_agents UUID[]
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    ARRAY_AGG(DISTINCT e1.agent_id)
  FROM job_executions e1
  JOIN job_executions e2
    ON e2.agent_id = e1.agent_id
   AND e2.execution_index = e1.execution_index + 1
  WHERE e2.previous_execution_hash IS NOT NULL
    AND e1.execution_hash IS NOT NULL
    AND e2.previous_execution_hash != e1.execution_hash;
END;
$$;

-- =====================
-- PHASE 5: Update claim_jobs_for_agent to include chain context
-- =====================

-- Drop existing function first (to change signature)
DROP FUNCTION IF EXISTS claim_jobs_for_agent(UUID, INTEGER);

-- Recreate with hash chain support
CREATE OR REPLACE FUNCTION claim_jobs_for_agent(
  p_agent_id UUID,
  p_max_jobs INTEGER DEFAULT 5
)
RETURNS TABLE(
  job_id UUID,
  job_type TEXT,
  payload JSONB,
  payload_hash TEXT,
  expires_at TIMESTAMPTZ,
  execution_id UUID,
  nonce TEXT,
  execution_index BIGINT,
  previous_execution_hash TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_name TEXT;
  v_tenant_id UUID;
  v_last_index BIGINT;
  v_last_hash TEXT;
BEGIN
  -- Get agent info
  SELECT agent_name, tenant_id INTO v_agent_name, v_tenant_id
  FROM agents
  WHERE id = p_agent_id;
  
  IF v_agent_name IS NULL THEN
    RAISE EXCEPTION 'Agent not found: %', p_agent_id;
  END IF;
  
  -- Get or create chain pointer for this agent
  INSERT INTO agent_execution_chain (agent_id, last_execution_hash, last_execution_index)
  VALUES (p_agent_id, 'GENESIS', 0)
  ON CONFLICT (agent_id) DO NOTHING;
  
  -- Lock and fetch current chain state
  SELECT aec.last_execution_index, aec.last_execution_hash
  INTO v_last_index, v_last_hash
  FROM agent_execution_chain aec
  WHERE aec.agent_id = p_agent_id
  FOR UPDATE;
  
  RETURN QUERY
  WITH claimable_jobs AS (
    SELECT j.id, j.type, j.payload, j.payload_hash, j.expires_at
    FROM jobs j
    WHERE j.agent_id = p_agent_id
      AND j.status = 'queued'
      AND j.approved = true
      AND (j.expires_at IS NULL OR j.expires_at > NOW())
      AND j.current_execution_id IS NULL
    ORDER BY j.priority DESC NULLS LAST, j.created_at ASC
    LIMIT p_max_jobs
    FOR UPDATE OF j SKIP LOCKED
  ),
  numbered_jobs AS (
    SELECT 
      cj.*,
      ROW_NUMBER() OVER (ORDER BY cj.id) as rn
    FROM claimable_jobs cj
  ),
  created_executions AS (
    INSERT INTO job_executions (
      job_id,
      agent_id,
      status,
      nonce,
      payload_hash,
      claimed_at,
      started_at,
      execution_index,
      previous_execution_hash
    )
    SELECT 
      nj.id,
      p_agent_id,
      'claimed',
      encode(gen_random_bytes(16), 'hex'),
      nj.payload_hash,
      NOW(),
      NOW(),
      v_last_index + nj.rn,
      CASE WHEN nj.rn = 1 THEN v_last_hash ELSE NULL END -- Will be filled by chain logic
    FROM numbered_jobs nj
    RETURNING job_executions.id, job_executions.job_id, job_executions.nonce, 
              job_executions.execution_index, job_executions.previous_execution_hash
  )
  SELECT 
    j.id AS job_id,
    j.type AS job_type,
    j.payload,
    j.payload_hash,
    j.expires_at,
    ce.id AS execution_id,
    ce.nonce,
    ce.execution_index,
    COALESCE(ce.previous_execution_hash, v_last_hash) AS previous_execution_hash
  FROM created_executions ce
  JOIN jobs j ON j.id = ce.job_id;
  
  -- Update jobs to delivered status and link execution
  UPDATE jobs j
  SET status = 'delivered',
      delivered_at = NOW(),
      current_execution_id = ce.id
  FROM (
    SELECT je.id, je.job_id
    FROM job_executions je
    WHERE je.agent_id = p_agent_id
      AND je.status = 'claimed'
      AND je.claimed_at >= NOW() - INTERVAL '1 minute'
  ) ce
  WHERE j.id = ce.job_id;
  
  -- Update chain pointer with highest index claimed
  UPDATE agent_execution_chain
  SET last_execution_index = (
    SELECT COALESCE(MAX(je.execution_index), last_execution_index)
    FROM job_executions je
    WHERE je.agent_id = p_agent_id
      AND je.claimed_at >= NOW() - INTERVAL '1 minute'
  ),
  updated_at = NOW()
  WHERE agent_id = p_agent_id;
END;
$$;

-- =====================
-- PHASE 6: Cron sentinel for key expiration monitoring
-- =====================

-- Schedule key expiration check every 6 hours
SELECT cron.schedule(
  'poe-key-expiration-sentinel',
  '0 */6 * * *',
  $$
  DO $inner$
  DECLARE
    v_expired_count BIGINT;
    v_affected UUID[];
  BEGIN
    SELECT expired_count, agents_affected
    INTO v_expired_count, v_affected
    FROM check_expired_agent_keys();
    
    IF v_expired_count > 0 THEN
      RAISE WARNING '[POE-SENTINEL] EXPIRED KEYS DETECTED: count=%, agents=%',
        v_expired_count, v_affected;
    END IF;
  END;
  $inner$;
  $$
);

-- Schedule chain break check every 15 minutes
SELECT cron.schedule(
  'poe-chain-integrity-sentinel',
  '*/15 * * * *',
  $$
  DO $inner$
  DECLARE
    v_break_count BIGINT;
    v_affected UUID[];
  BEGIN
    SELECT break_count, affected_agents
    INTO v_break_count, v_affected
    FROM detect_chain_breaks();
    
    IF v_break_count > 0 THEN
      RAISE WARNING '[POE-SENTINEL] CHAIN BREAKS DETECTED: count=%, agents=%',
        v_break_count, v_affected;
    END IF;
  END;
  $inner$;
  $$
);