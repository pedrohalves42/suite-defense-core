-- Migration: Add payload_hash to agents table and ensure agent_token removal
-- Description: Adds payload_hash column for tracking agent payload changes
-- This migration is idempotent and safe to re-run

-- Add payload_hash column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'agents' 
    AND column_name = 'payload_hash'
  ) THEN
    ALTER TABLE public.agents 
    ADD COLUMN payload_hash TEXT;
    
    -- Add comment explaining the column purpose
    COMMENT ON COLUMN public.agents.payload_hash IS 
      'SHA-256 hash of agent configuration payload for detecting changes';
  END IF;
END $$;

-- Ensure agent_token column is removed (idempotent)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'agents' 
    AND column_name = 'agent_token'
  ) THEN
    ALTER TABLE public.agents 
    DROP COLUMN agent_token CASCADE;
  END IF;
END $$;

-- Create index on payload_hash for faster lookups (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'agents' 
    AND indexname = 'idx_agents_payload_hash'
  ) THEN
    CREATE INDEX idx_agents_payload_hash 
    ON public.agents(payload_hash) 
    WHERE payload_hash IS NOT NULL;
  END IF;
END $$;