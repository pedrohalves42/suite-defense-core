-- ============================================
-- CORRECAO: Remover view publica insegura
-- ============================================

-- Remover a view publica que esta causando warning de seguranca
DROP VIEW IF EXISTS public.installation_metrics_hourly;

-- A materialized view permanece em private.installation_metrics_hourly
-- Ela NAO e exposta via API REST, entao nao ha risco de vazamento

-- Comentario na materialized view privada
COMMENT ON MATERIALIZED VIEW private.installation_metrics_hourly IS 
'Installation analytics aggregated by hour. NOT exposed via API (private schema). Access only via edge functions with proper tenant_id filtering.';