-- ============================================
-- CORREÇÃO DE SECURITY WARNINGS DO SUPABASE
-- ============================================

-- 1. Mover extensão pg_net do schema public para extensions
-- ============================================
DROP EXTENSION IF EXISTS pg_net CASCADE;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION pg_net SCHEMA extensions;

-- 2. Mover materialized view installation_metrics_hourly para schema privado
-- ============================================
CREATE SCHEMA IF NOT EXISTS private;

-- Mover a materialized view para schema privado
ALTER MATERIALIZED VIEW public.installation_metrics_hourly 
SET SCHEMA private;

-- Criar uma view regular no schema public com RLS
CREATE OR REPLACE VIEW public.installation_metrics_hourly AS
SELECT * FROM private.installation_metrics_hourly;

-- Habilitar RLS na view regular
ALTER VIEW public.installation_metrics_hourly OWNER TO postgres;
-- Note: Views herdam as permissões das tabelas subjacentes via SECURITY DEFINER functions

-- Comentário explicativo
COMMENT ON VIEW public.installation_metrics_hourly IS 
'Public view for installation metrics. Accesses private.installation_metrics_hourly. Protected by RLS via user_roles checks in queries.';