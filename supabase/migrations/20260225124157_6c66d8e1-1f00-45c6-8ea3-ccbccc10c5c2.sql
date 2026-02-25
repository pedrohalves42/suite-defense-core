-- Add the missing completed_at column to job_executions
ALTER TABLE public.job_executions ADD COLUMN completed_at timestamptz;