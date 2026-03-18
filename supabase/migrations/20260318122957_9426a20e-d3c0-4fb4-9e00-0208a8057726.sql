
-- Fix poll interval flip-flop: align DB default with heartbeat response (600s)
-- The agents table had default 60, but heartbeat/poll-jobs always return 600
-- This mismatch causes agents to oscillate between values

ALTER TABLE public.agents 
  ALTER COLUMN poll_interval_seconds SET DEFAULT 600;

-- Update all agents currently at the old default (60) to 600
UPDATE public.agents 
  SET poll_interval_seconds = 600 
  WHERE poll_interval_seconds IN (60, 300);
