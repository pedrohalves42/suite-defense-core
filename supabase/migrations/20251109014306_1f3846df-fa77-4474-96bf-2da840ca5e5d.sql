-- Add scheduling fields to jobs table
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS scheduled_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS recurrence_pattern text,
ADD COLUMN IF NOT EXISTS parent_job_id uuid REFERENCES public.jobs(id),
ADD COLUMN IF NOT EXISTS last_run_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS next_run_at timestamp with time zone;

-- Add index for scheduled jobs lookup
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_at ON public.jobs(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_next_run_at ON public.jobs(next_run_at) WHERE next_run_at IS NOT NULL AND is_recurring = true;

-- Add check constraint to ensure recurrence_pattern is set if job is recurring
ALTER TABLE public.jobs
DROP CONSTRAINT IF EXISTS check_recurring_has_pattern;

ALTER TABLE public.jobs
ADD CONSTRAINT check_recurring_has_pattern 
CHECK (
  (is_recurring = false) OR 
  (is_recurring = true AND recurrence_pattern IS NOT NULL)
);

-- Function to calculate next run time based on cron pattern
CREATE OR REPLACE FUNCTION public.calculate_next_run(pattern text, from_time timestamp with time zone DEFAULT now())
RETURNS timestamp with time zone
LANGUAGE plpgsql
AS $$
DECLARE
  next_time timestamp with time zone;
BEGIN
  -- Simple pattern parsing for common cases
  -- Format: "minutes hours day month weekday"
  -- Examples: 
  --   "0 * * * *" = every hour
  --   "*/5 * * * *" = every 5 minutes
  --   "0 0 * * *" = daily at midnight
  --   "0 0 * * 0" = weekly on Sunday
  
  -- For MVP, we'll handle simple intervals
  CASE pattern
    WHEN '*/5 * * * *' THEN next_time := from_time + INTERVAL '5 minutes';
    WHEN '*/15 * * * *' THEN next_time := from_time + INTERVAL '15 minutes';
    WHEN '*/30 * * * *' THEN next_time := from_time + INTERVAL '30 minutes';
    WHEN '0 * * * *' THEN next_time := date_trunc('hour', from_time) + INTERVAL '1 hour';
    WHEN '0 0 * * *' THEN next_time := date_trunc('day', from_time) + INTERVAL '1 day';
    WHEN '0 0 * * 0' THEN next_time := date_trunc('week', from_time) + INTERVAL '1 week';
    ELSE next_time := from_time + INTERVAL '1 hour'; -- default fallback
  END CASE;
  
  RETURN next_time;
END;
$$;

COMMENT ON COLUMN public.jobs.scheduled_at IS 'When the job should be executed (one-time scheduled jobs)';
COMMENT ON COLUMN public.jobs.is_recurring IS 'Whether this job should repeat on a schedule';
COMMENT ON COLUMN public.jobs.recurrence_pattern IS 'Cron-like pattern for recurring jobs (e.g., "0 * * * *" for hourly)';
COMMENT ON COLUMN public.jobs.parent_job_id IS 'Reference to the original job if this is a recurring instance';
COMMENT ON COLUMN public.jobs.last_run_at IS 'Last time this recurring job was executed';
COMMENT ON COLUMN public.jobs.next_run_at IS 'Next scheduled execution time for recurring jobs';