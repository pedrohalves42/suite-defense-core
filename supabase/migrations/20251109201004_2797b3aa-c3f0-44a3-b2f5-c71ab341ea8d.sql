-- Fix SECURITY DEFINER functions by adding SET search_path = public
-- This prevents SQL injection and privilege escalation via schema path manipulation

-- 1. Fix cleanup_expired_keys function
CREATE OR REPLACE FUNCTION public.cleanup_expired_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.enrollment_keys
  SET is_active = false
  WHERE expires_at < now() AND is_active = true;
END;
$function$;

-- 2. Fix cleanup_old_hmac_signatures function
CREATE OR REPLACE FUNCTION public.cleanup_old_hmac_signatures()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.hmac_signatures
  WHERE used_at < now() - INTERVAL '5 minutes';
END;
$function$;

-- 3. Fix cleanup_old_rate_limits function
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '1 hour';
END;
$function$;

-- 4. Fix update_tenant_settings_updated_at function
CREATE OR REPLACE FUNCTION public.update_tenant_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 5. Fix set_tenant_id_from_user function
CREATE OR REPLACE FUNCTION public.set_tenant_id_from_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := current_user_tenant_id();
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'Cannot determine tenant_id for user';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. Fix calculate_next_run function
CREATE OR REPLACE FUNCTION public.calculate_next_run(pattern text, from_time timestamp with time zone DEFAULT now())
RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path = public
AS $function$
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
$function$;