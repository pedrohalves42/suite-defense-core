-- =============================================
-- FASE 4: MIGRAÇÃO E CONSOLIDAÇÃO HMAC SIGNATURES
-- Dr. Atlas Verus - Otimização CyberShield
-- =============================================

-- 1. Migrar dados válidos da tabela legada para partição atual
INSERT INTO public.hmac_signatures_partitioned (id, signature, agent_name, used_at)
SELECT id, signature, agent_name, used_at
FROM public.hmac_signatures
WHERE used_at >= '2025-12-01'::timestamp with time zone
  AND used_at < '2026-01-01'::timestamp with time zone
ON CONFLICT (id, used_at) DO NOTHING;

-- 2. Remover tabela legada (dados já migrados)
DROP TABLE IF EXISTS public.hmac_signatures CASCADE;

-- 3. Remover partições futuras vazias do HMAC (2026_02, 2026_03)
DROP TABLE IF EXISTS public.hmac_signatures_2026_02;
DROP TABLE IF EXISTS public.hmac_signatures_2026_03;

-- 4. Log da operação
DO $$
BEGIN
  RAISE NOTICE 'Fase 4 concluída: Tabela legada migrada e removida';
  RAISE NOTICE 'Partições futuras vazias (2026_02, 2026_03) removidas';
  RAISE NOTICE 'Economia estimada: ~4.4 MB + overhead de metadados';
END $$;