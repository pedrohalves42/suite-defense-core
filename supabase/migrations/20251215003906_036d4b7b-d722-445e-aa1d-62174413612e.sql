-- =============================================
-- FASE 1: LIMPEZA DE ÍNDICES NÃO UTILIZADOS
-- Dr. Atlas Verus - Otimização CyberShield
-- =============================================

-- 1. Remover índices da tabela cve_database (nunca utilizados)
DROP INDEX IF EXISTS idx_cve_database_cve_id;
DROP INDEX IF EXISTS idx_cve_database_severity;
DROP INDEX IF EXISTS idx_cve_database_cached_at;
DROP INDEX IF EXISTS idx_cve_database_affected_products;
DROP INDEX IF EXISTS idx_cve_database_published_date;

-- 2. Remover índices da tabela agent_web_activity (baixa utilidade)
DROP INDEX IF EXISTS idx_agent_web_activity_category;
DROP INDEX IF EXISTS idx_agent_web_activity_browser;

-- 3. Remover índices da tabela virus_scans (apenas 10 rows, overhead desnecessário)
DROP INDEX IF EXISTS idx_virus_scans_agent;
DROP INDEX IF EXISTS idx_virus_scans_tenant;
DROP INDEX IF EXISTS idx_virus_scans_status;
DROP INDEX IF EXISTS idx_virus_scans_created;

-- Log da operação
DO $$
BEGIN
  RAISE NOTICE 'Fase 1 concluída: 11 índices não utilizados removidos';
  RAISE NOTICE 'Economia estimada: ~3 MB de storage + 30%% menos overhead em INSERT';
END $$;