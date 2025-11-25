-- =====================================================
-- Migration: Fix Job Status Bug (pending -> queued)
-- Purpose: Update existing jobs stuck in 'pending' status to 'queued' 
--          so they can be delivered to agents via poll-jobs
-- Date: 2025-01-25
-- Critical Bug Fix: poll-jobs only queries for 'queued' jobs, 
--                   but SecurityJobDispatcher and process-agent-updates 
--                   were creating jobs with 'pending' status
-- =====================================================

-- Update all pending jobs to queued status
UPDATE jobs 
SET status = 'queued' 
WHERE status = 'pending';

-- Log the fix
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % jobs from pending to queued status', v_updated_count;
END $$;