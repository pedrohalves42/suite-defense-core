-- Atualizar RPC installation_health_summary para usar 7 dias ao inves de 24h
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
SECURITY INVOKER
SET search_path = public
STABLE
AS $$
  SELECT 
    ia.platform AS os_type,
    COUNT(*) AS total_events,
    COUNT(*) FILTER (WHERE ia.success = true) AS successful_events,
    COUNT(*) FILTER (WHERE ia.success = false) AS failed_events,
    ROUND(
      (COUNT(*) FILTER (WHERE ia.success = true)::NUMERIC / 
       NULLIF(COUNT(*)::NUMERIC, 0)) * 100, 
      1
    ) AS success_rate,
    '7 days' AS window_interval
  FROM installation_analytics ia
  WHERE ia.created_at > NOW() - INTERVAL '7 days'
    AND ia.event_type = 'post_installation'
    AND ia.tenant_id IN (
      SELECT ur.tenant_id 
      FROM user_roles ur 
      WHERE ur.user_id = auth.uid()
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

COMMENT ON FUNCTION installation_health_summary() IS 
  'Retorna metricas de instalacao por OS (ultimos 7 dias). Usado pelo InstallationHealthCard. Respeita RLS filtrando por tenant_id do usuario autenticado.';