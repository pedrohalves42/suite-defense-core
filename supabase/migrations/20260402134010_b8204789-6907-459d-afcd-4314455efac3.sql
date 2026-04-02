
-- ============================================================
-- HONEYPOT HARDENING MIGRATION
-- Fixes: rate limit, missing columns, IP hashing, cooldown
-- ============================================================

-- 1. Drop old rate limit table and its functions/policies
DROP POLICY IF EXISTS "deny_authenticated_honeypot_rate_limits" ON public.honeypot_rate_limits;
DROP TABLE IF EXISTS public.honeypot_rate_limits;
DROP FUNCTION IF EXISTS public.check_honeypot_rate_limit;
DROP FUNCTION IF EXISTS public.cleanup_honeypot_rate_limits;

-- 2. Create bucket-based rate limit (atomic upsert, no count(*))
CREATE TABLE IF NOT EXISTS public.honeypot_rate_buckets (
  identifier_hash TEXT NOT NULL,
  bucket_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 1,
  PRIMARY KEY (identifier_hash, bucket_start)
);

ALTER TABLE public.honeypot_rate_buckets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_authenticated_rate_buckets"
  ON public.honeypot_rate_buckets FOR ALL TO authenticated USING (false);

-- 3. Create blocks table
CREATE TABLE IF NOT EXISTS public.honeypot_blocks (
  identifier_hash TEXT PRIMARY KEY,
  blocked_until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_honeypot_blocks_until
  ON public.honeypot_blocks (blocked_until);

ALTER TABLE public.honeypot_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_authenticated_blocks"
  ON public.honeypot_blocks FOR ALL TO authenticated USING (false);

-- 4. New atomic rate limit RPC (bucket upsert, no count(*) scan)
CREATE OR REPLACE FUNCTION public.check_honeypot_rate_limit_v2(
  p_identifier_hash TEXT,
  p_max_requests INT DEFAULT 5,
  p_bucket_seconds INT DEFAULT 60,
  p_block_seconds INT DEFAULT 900
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked TIMESTAMPTZ;
  v_bucket TIMESTAMPTZ;
  v_count INT;
BEGIN
  -- 1. Check block table
  SELECT blocked_until INTO v_blocked
  FROM public.honeypot_blocks
  WHERE identifier_hash = p_identifier_hash
    AND blocked_until > now();

  IF v_blocked IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- 2. Compute current bucket (truncate to bucket_seconds)
  v_bucket := date_trunc('minute', now());

  -- 3. Atomic upsert: increment or insert
  INSERT INTO public.honeypot_rate_buckets (identifier_hash, bucket_start, request_count)
  VALUES (p_identifier_hash, v_bucket, 1)
  ON CONFLICT (identifier_hash, bucket_start)
  DO UPDATE SET request_count = public.honeypot_rate_buckets.request_count + 1
  RETURNING request_count INTO v_count;

  -- 4. If over limit, block
  IF v_count > p_max_requests THEN
    INSERT INTO public.honeypot_blocks (identifier_hash, blocked_until, reason)
    VALUES (p_identifier_hash, now() + make_interval(secs := p_block_seconds), 'rate_limit_exceeded')
    ON CONFLICT (identifier_hash)
    DO UPDATE SET blocked_until = EXCLUDED.blocked_until, reason = EXCLUDED.reason;
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_honeypot_rate_limit_v2 TO service_role;

-- 5. Cleanup function for old buckets
CREATE OR REPLACE FUNCTION public.cleanup_honeypot_rate_data(p_older_than_minutes INT DEFAULT 10)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
  v_tmp INT;
BEGIN
  DELETE FROM public.honeypot_rate_buckets
  WHERE bucket_start < now() - make_interval(mins := p_older_than_minutes);
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_deleted := v_deleted + v_tmp;

  DELETE FROM public.honeypot_blocks
  WHERE blocked_until < now();
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_deleted := v_deleted + v_tmp;

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_honeypot_rate_data TO service_role;

-- 6. Add missing columns to honeypot_interactions
ALTER TABLE public.honeypot_interactions
  ADD COLUMN IF NOT EXISTS status_code INT,
  ADD COLUMN IF NOT EXISTS response_profile TEXT DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS source_ip_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_ip_prefix TEXT;

-- 7. Drop raw source_ip (replaced by hash + prefix for privacy)
ALTER TABLE public.honeypot_interactions
  DROP COLUMN IF EXISTS source_ip;

-- 8. Add state change tracking to agents for cooldown
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS last_honeypot_state_change_at TIMESTAMPTZ;

-- 9. Fix indexes for new columns
DROP INDEX IF EXISTS idx_honeypot_interactions_ip;

CREATE INDEX IF NOT EXISTS idx_honeypot_interactions_ip_hash
  ON public.honeypot_interactions (source_ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_honeypot_interactions_classification
  ON public.honeypot_interactions (classification, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_honeypot_interactions_agent
  ON public.honeypot_interactions (agent_id, created_at DESC);
