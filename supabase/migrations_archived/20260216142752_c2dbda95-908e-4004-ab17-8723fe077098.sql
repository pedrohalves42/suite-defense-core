
-- Atomic hit counter increment for AI cache
CREATE OR REPLACE FUNCTION public.increment_ai_cache_hit(cache_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.ai_response_cache
  SET hit_count = hit_count + 1,
      last_hit_at = now()
  WHERE id = cache_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Restrict to service_role
REVOKE ALL ON FUNCTION public.increment_ai_cache_hit(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_ai_cache_hit(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_ai_cache_hit(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_ai_cache_hit(UUID) TO authenticated;
