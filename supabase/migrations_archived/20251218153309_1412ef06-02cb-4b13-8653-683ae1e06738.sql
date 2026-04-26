-- ========================================
-- SUPPLY CHAIN GUARDRAIL (P2 - Defense in Depth)
-- Prevents placeholder/corrupted scripts at database level
-- ========================================

-- Add CHECK constraint to ensure minimum script size
-- This is defense-in-depth: primary validation is in Edge Function
ALTER TABLE agent_releases
ADD CONSTRAINT chk_script_content_min_size
CHECK (LENGTH(script_content) > 10000);

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT chk_script_content_min_size ON agent_releases IS 
'Supply chain protection: Prevents registration of placeholder or corrupted scripts smaller than 10KB. Primary validation is in register-agent-release Edge Function.';