-- ============================================
-- [JOB]  CREATE RPC: installation_health_summary()
-- ============================================
-- Retorna metricas de instalacao por OS (ultimas 24h)
-- Usado pelo componente InstallationHealthCard

CREATE OR REPLACE FUNCTION installation_health_summary()
RETURNS TABLE (
  os_type TEXT,
  total_events BIGINT,
  successful_events BIGINT,
  failed_events BIGINT,
  success_rate NUMERIC,
  window_interval TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ia.platform AS os_type,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE ia.success IS TRUE) AS successful_events,
    COUNT(*) FILTER (WHERE ia.success IS FALSE) AS failed_events,
    ROUND(
      CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE 100.0 * COUNT(*) FILTER (WHERE ia.success IS TRUE) / COUNT(*)
      END, 1
    ) AS success_rate,
    'last_24h'::TEXT AS window_interval
  FROM installation_analytics ia
  WHERE ia.event_type IN ('post_installation', 'post_installation_unverified')
    AND ia.created_at > NOW() - INTERVAL '24 hours'
    AND ia.tenant_id IN (
      SELECT tenant_id 
      FROM user_roles 
      WHERE user_id = auth.uid()
    )
  GROUP BY ia.platform
  ORDER BY 
    CASE ia.platform
      WHEN 'macos' THEN 0
      WHEN 'windows' THEN 1
      WHEN 'linux' THEN 2
      ELSE 3
    END;
$$;

-- Grant para authenticated users
GRANT EXECUTE ON FUNCTION installation_health_summary() TO authenticated;

-- Comentario descritivo
COMMENT ON FUNCTION installation_health_summary() IS 
  'Retorna metricas de instalacao por OS (ultimas 24h). Usado pelo InstallationHealthCard. Respeita RLS filtrando por tenant_id do usuario autenticado.';
