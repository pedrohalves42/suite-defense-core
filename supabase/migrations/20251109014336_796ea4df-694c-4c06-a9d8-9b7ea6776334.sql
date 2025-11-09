-- Fix security issue: add search_path to calculate_next_run function
CREATE OR REPLACE FUNCTION public.calculate_next_run(pattern text, from_time timestamp with time zone DEFAULT now())
RETURNS timestamp with time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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