-- ============================================
-- CORREÇÃO: Remover view pública insegura
-- ============================================

-- Remover a view pública que está causando warning de segurança
DROP VIEW IF EXISTS public.installation_metrics_hourly;

-- A materialized view permanece em private.installation_metrics_hourly
-- Ela NÃO é exposta via API REST, então não há risco de vazamento

-- Comentário na materialized view privada
COMMENT ON MATERIALIZED VIEW private.installation_metrics_hourly IS 
'Installation analytics aggregated by hour. NOT exposed via API (private schema). Access only via edge functions with proper tenant_id filtering.';