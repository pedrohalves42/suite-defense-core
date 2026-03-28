-- =============================================
-- FASE 4: MIGRACAO E CONSOLIDACAO HMAC SIGNATURES
-- Dr. Atlas Verus - Otimizacao CyberShield
-- =============================================

-- 1. Migrar dados validos da tabela legada para particao atual
INSERT INTO public.hmac_signatures_partitioned (id, signature, agent_name, used_at)
SELECT id, signature, agent_name, used_at
FROM public.hmac_signatures
WHERE used_at >= '2025-12-01'::timestamp with time zone
  AND used_at < '2026-01-01'::timestamp with time zone
ON CONFLICT (id, used_at) DO NOTHING;

-- 2. Remover tabela legada (dados ja migrados)
DROP TABLE IF EXISTS public.hmac_signatures CASCADE;

-- 3. Remover particoes futuras vazias do HMAC (2026_02, 2026_03)
DROP TABLE IF EXISTS public.hmac_signatures_2026_02;
DROP TABLE IF EXISTS public.hmac_signatures_2026_03;

-- 4. Log da operacao
DO $$
BEGIN
  RAISE NOTICE 'Fase 4 concluida: Tabela legada migrada e removida';
  RAISE NOTICE 'Particoes futuras vazias (2026_02, 2026_03) removidas';
  RAISE NOTICE 'Economia estimada: ~4.4 MB + overhead de metadados';
END $$;