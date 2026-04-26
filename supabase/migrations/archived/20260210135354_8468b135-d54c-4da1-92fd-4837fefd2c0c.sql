-- Add force_update delivery tracking columns to agents table
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS force_update_delivered_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS force_update_first_delivered_at timestamptz;