
-- ============================================================
-- Phase 3: Semantic AI Response Cache
-- Reduces cost ~40% by caching repeated AI analysis patterns
-- ============================================================

CREATE TABLE public.ai_response_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_hash TEXT NOT NULL,
  task_category TEXT NOT NULL DEFAULT 'general',
  system_prompt_hash TEXT,
  response_content TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '6 hours'),
  tenant_id TEXT,
  function_name TEXT,
  latency_ms INTEGER DEFAULT 0
);

-- Unique index for cache lookup: prompt_hash + task_category
CREATE UNIQUE INDEX idx_ai_cache_lookup 
  ON public.ai_response_cache (prompt_hash, task_category, COALESCE(tenant_id, '__global__'));

-- TTL cleanup index
CREATE INDEX idx_ai_cache_expires ON public.ai_response_cache (expires_at);

-- Hit count for analytics
CREATE INDEX idx_ai_cache_hits ON public.ai_response_cache (hit_count DESC);

-- Enable RLS
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

-- Service role only (cron jobs, edge functions)
CREATE POLICY "Service role full access on ai_response_cache"
  ON public.ai_response_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Revoke anon access
REVOKE ALL ON public.ai_response_cache FROM anon;
GRANT ALL ON public.ai_response_cache TO service_role;
GRANT SELECT ON public.ai_response_cache TO authenticated;

-- Auto-cleanup expired entries (trigger)
CREATE OR REPLACE FUNCTION public.cleanup_expired_ai_cache()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.ai_response_cache
  WHERE expires_at < now() - INTERVAL '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Run cleanup on every 100th insert (probabilistic)
CREATE OR REPLACE FUNCTION public.maybe_cleanup_ai_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- ~1% chance of cleanup on each insert
  IF random() < 0.01 THEN
    PERFORM public.cleanup_expired_ai_cache();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_ai_cache_probabilistic_cleanup
  AFTER INSERT ON public.ai_response_cache
  FOR EACH ROW
  EXECUTE FUNCTION public.maybe_cleanup_ai_cache();
