
-- ============================================================
-- HONEYPOT FOUNDATION MIGRATION
-- Sprint 1: Native honeypot + Sprint 3: Agent flipping support
-- ============================================================

-- 1. Add honeypot columns to agents table
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS honeypot_mode TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS honeypot_activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS honeypot_activated_by UUID,
  ADD COLUMN IF NOT EXISTS honeypot_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_honeypot_interaction_at TIMESTAMPTZ;

-- 2. Validation trigger (not CHECK constraint, per project pattern)
CREATE OR REPLACE FUNCTION public.validate_honeypot_mode()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.honeypot_mode NOT IN ('none', 'native', 'flipped') THEN
    RAISE EXCEPTION 'Invalid honeypot_mode: %. Must be none, native, or flipped.', NEW.honeypot_mode;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_honeypot_mode ON public.agents;
CREATE TRIGGER trg_validate_honeypot_mode
  BEFORE INSERT OR UPDATE OF honeypot_mode ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.validate_honeypot_mode();

-- 3. Honeypot interactions table (separate from security_logs for cost/retention)
CREATE TABLE IF NOT EXISTS public.honeypot_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'native',
  method TEXT,
  path TEXT,
  body_snippet TEXT,
  headers_filtered JSONB,
  source_ip TEXT,
  classification TEXT DEFAULT 'unknown',
  trace_id TEXT,
  ai_analyzed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Honeypot rate limits table
CREATE TABLE IF NOT EXISTS public.honeypot_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INT NOT NULL DEFAULT 1,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Indexes (partial, cost-efficient)
CREATE INDEX IF NOT EXISTS idx_agents_honeypot_active
  ON public.agents (honeypot_mode)
  WHERE honeypot_mode <> 'none';

CREATE INDEX IF NOT EXISTS idx_honeypot_interactions_tenant
  ON public.honeypot_interactions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_honeypot_interactions_ip
  ON public.honeypot_interactions (source_ip, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_honeypot_interactions_unanalyzed
  ON public.honeypot_interactions (created_at)
  WHERE ai_analyzed = false;

CREATE INDEX IF NOT EXISTS idx_honeypot_rate_limits_identifier
  ON public.honeypot_rate_limits (identifier, window_start DESC);

CREATE INDEX IF NOT EXISTS idx_honeypot_rate_limits_blocked
  ON public.honeypot_rate_limits (identifier)
  WHERE blocked_until IS NOT NULL;

-- 6. RLS on honeypot_interactions
ALTER TABLE public.honeypot_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_honeypot_interactions"
  ON public.honeypot_interactions
  FOR ALL
  TO authenticated
  USING (tenant_id = public.get_active_tenant_id());

-- 7. RLS on honeypot_rate_limits (service role only — no authenticated access)
ALTER TABLE public.honeypot_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated users; only service_role bypasses RLS

-- 8. Atomic rate limit RPC
CREATE OR REPLACE FUNCTION public.check_honeypot_rate_limit(
  p_identifier TEXT,
  p_max_requests INT DEFAULT 5,
  p_window_minutes INT DEFAULT 1,
  p_block_minutes INT DEFAULT 15
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
  v_blocked TIMESTAMPTZ;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Check if currently blocked
  SELECT blocked_until INTO v_blocked
  FROM public.honeypot_rate_limits
  WHERE identifier = p_identifier
    AND blocked_until IS NOT NULL
    AND blocked_until > now()
  LIMIT 1;

  IF v_blocked IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- Count requests in current window
  v_window_start := now() - make_interval(mins := p_window_minutes);

  SELECT count(*) INTO v_count
  FROM public.honeypot_rate_limits
  WHERE identifier = p_identifier
    AND window_start > v_window_start
    AND blocked_until IS NULL;

  IF v_count >= p_max_requests THEN
    -- Block the identifier
    INSERT INTO public.honeypot_rate_limits (identifier, blocked_until)
    VALUES (p_identifier, now() + make_interval(mins := p_block_minutes));
    RETURN FALSE;
  END IF;

  -- Record this request
  INSERT INTO public.honeypot_rate_limits (identifier)
  VALUES (p_identifier);

  RETURN TRUE;
END;
$$;

-- Grant execute to service role (used by edge functions)
GRANT EXECUTE ON FUNCTION public.check_honeypot_rate_limit TO service_role;

-- 9. Cleanup function for old rate limit entries (called by cron)
CREATE OR REPLACE FUNCTION public.cleanup_honeypot_rate_limits(p_older_than_minutes INT DEFAULT 60)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM public.honeypot_rate_limits
  WHERE created_at < now() - make_interval(mins := p_older_than_minutes);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_honeypot_rate_limits TO service_role;
