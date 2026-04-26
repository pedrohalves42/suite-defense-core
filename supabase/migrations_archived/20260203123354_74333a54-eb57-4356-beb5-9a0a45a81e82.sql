-- ============================================================
-- MIGRACAO: Correcao dos Findings do Security Scanner
-- ============================================================

-- 1. Revogar grant de anon em active_agents
REVOKE ALL ON active_agents FROM anon;
REVOKE ALL ON active_agents FROM PUBLIC;

-- Garantir que apenas authenticated e service_role tem acesso
GRANT SELECT ON active_agents TO authenticated;
GRANT SELECT ON active_agents TO service_role;

-- 2. Habilitar RLS na particao de metricas
ALTER TABLE agent_system_metrics_2026_03 ENABLE ROW LEVEL SECURITY;

-- Politica para service_role (backend)
CREATE POLICY "service_role_full_access" ON agent_system_metrics_2026_03
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Politica para leitura autenticada
CREATE POLICY "authenticated_read_own_tenant" ON agent_system_metrics_2026_03
  FOR SELECT TO authenticated
  USING (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- 3. Recriar v_cron_health com security_invoker
DROP VIEW IF EXISTS v_cron_health;

CREATE VIEW v_cron_health 
WITH (security_invoker = on) AS
SELECT 
  cron_name,
  last_success_at,
  consecutive_failures,
  CASE
    WHEN last_success_at IS NULL THEN 'never_run'
    WHEN consecutive_failures >= 3 THEN 'critical'
    WHEN consecutive_failures >= 1 THEN 'warning'
    WHEN last_success_at < NOW() - INTERVAL '2 hours' 
      AND cron_name LIKE '%15min%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '12 hours' 
      AND cron_name LIKE '%6h%' THEN 'stale'
    WHEN last_success_at < NOW() - INTERVAL '48 hours' 
      AND cron_name LIKE '%daily%' THEN 'stale'
    ELSE 'healthy'
  END AS status
FROM cron_health_checks;

GRANT SELECT ON v_cron_health TO authenticated;
GRANT SELECT ON v_cron_health TO service_role;

COMMENT ON VIEW v_cron_health IS 
'View de saude dos crons com security_invoker=on. Usada para monitoramento.';