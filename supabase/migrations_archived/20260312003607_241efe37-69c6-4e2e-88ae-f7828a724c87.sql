
-- V-1000: Fix agent_tokens.tenant_id - backfill and enforce NOT NULL
-- The first migration partially succeeded (backfill + delete worked, NOT NULL may have too)
-- Check and apply if needed
DO $$
BEGIN
  -- Only alter if still nullable
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'agent_tokens' 
    AND column_name = 'tenant_id' AND is_nullable = 'YES'
  ) THEN
    -- Backfill any remaining
    UPDATE agent_tokens at2
    SET tenant_id = a.tenant_id
    FROM agents a
    WHERE at2.agent_id = a.id AND at2.tenant_id IS NULL;
    
    DELETE FROM agent_tokens WHERE tenant_id IS NULL;
    ALTER TABLE agent_tokens ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- V-1001: Drop and recreate enrollment_keys_safe to fix column mismatch
DROP VIEW IF EXISTS enrollment_keys_safe CASCADE;

CREATE VIEW enrollment_keys_safe 
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
  id, 
  tenant_id,
  LEFT(key, 8) || '****' as key_masked,
  description,
  max_uses,
  current_uses,
  is_active,
  created_at,
  expires_at,
  created_by,
  used_at,
  agent_id,
  used_by_agent
FROM enrollment_keys
WHERE (
  is_current_super_admin() 
  OR tenant_id = get_active_tenant_id()
);
