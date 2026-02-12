
-- Fix default TTL from 7 days to 4 hours
ALTER TABLE public.jobs 
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '4 hours');
