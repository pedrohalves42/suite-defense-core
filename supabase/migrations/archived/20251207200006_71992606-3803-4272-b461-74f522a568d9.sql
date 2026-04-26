-- Fase 6: View para monitoramento de replay attempts
CREATE OR REPLACE FUNCTION public.get_replay_attempts(hours_back integer DEFAULT 1)
RETURNS TABLE(signature text, attempt_count bigint, first_attempt timestamptz, last_attempt timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT 
    signature,
    COUNT(*) as attempt_count,
    MIN(used_at) as first_attempt,
    MAX(used_at) as last_attempt
  FROM public.hmac_signatures
  WHERE used_at > now() - (hours_back || ' hours')::interval
  GROUP BY signature
  HAVING COUNT(*) > 1
  ORDER BY attempt_count DESC
  LIMIT 100;
$$;