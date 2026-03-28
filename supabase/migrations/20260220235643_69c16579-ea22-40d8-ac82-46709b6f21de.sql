
-- ============================================================
-- Tabela cron_health: Monitoramento de saude dos cron jobs
-- ============================================================

CREATE TABLE public.cron_health (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name text NOT NULL UNIQUE,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  total_runs integer NOT NULL DEFAULT 0,
  total_failures integer NOT NULL DEFAULT 0,
  avg_duration_ms integer,
  last_duration_ms integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cron_health ENABLE ROW LEVEL SECURITY;

-- Super admins can read cron health
CREATE POLICY "Super admins can view cron health"
  ON public.cron_health FOR SELECT
  USING (public.is_super_admin(auth.uid()));

-- RPC: update_cron_health (called by edge functions on success/failure)
CREATE OR REPLACE FUNCTION public.update_cron_health(
  p_cron_name text,
  p_success boolean,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.cron_health (cron_name, last_success_at, total_runs, metadata)
  VALUES (p_cron_name, CASE WHEN p_success THEN now() ELSE NULL END, 1, p_details)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = CASE WHEN p_success THEN now() ELSE cron_health.last_success_at END,
    last_failure_at = CASE WHEN NOT p_success THEN now() ELSE cron_health.last_failure_at END,
    last_error = CASE WHEN NOT p_success THEN p_details->>'error' ELSE cron_health.last_error END,
    consecutive_failures = CASE 
      WHEN p_success THEN 0 
      ELSE cron_health.consecutive_failures + 1 
    END,
    total_runs = cron_health.total_runs + 1,
    total_failures = CASE WHEN NOT p_success THEN cron_health.total_failures + 1 ELSE cron_health.total_failures END,
    metadata = p_details,
    updated_at = now();
END;
$$;

-- RPC: mark_cron_failure (called by edge functions on error)
CREATE OR REPLACE FUNCTION public.mark_cron_failure(
  p_cron_name text,
  p_error text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.update_cron_health(p_cron_name, false, jsonb_build_object('error', p_error));
END;
$$;

-- Index for quick lookups
CREATE INDEX idx_cron_health_name ON public.cron_health(cron_name);
CREATE INDEX idx_cron_health_failures ON public.cron_health(consecutive_failures) WHERE consecutive_failures > 0;
