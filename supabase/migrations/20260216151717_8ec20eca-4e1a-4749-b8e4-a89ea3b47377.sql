-- Etapa 2: Create missing increment_ai_cache_hit RPC
-- This was referenced by the cache adapter but never created

CREATE OR REPLACE FUNCTION public.increment_ai_cache_hit(cache_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE ai_response_cache
  SET 
    hit_count = hit_count + 1,
    last_hit_at = NOW()
  WHERE id = cache_id;
END;
$$;

-- Fix: Create a proper unique index for cache upsert
-- The adapter uses onConflict with COALESCE which PostgREST doesn't support well.
-- Instead, create a unique index that PostgREST can use.
DO $$
BEGIN
  -- Drop the problematic unique index if it exists
  DROP INDEX IF EXISTS idx_ai_cache_unique_prompt;
  
  -- Create a proper unique index for upsert
  CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_cache_prompt_category_tenant
    ON ai_response_cache (prompt_hash, task_category, COALESCE(tenant_id, '__global__'));
END;
$$;
