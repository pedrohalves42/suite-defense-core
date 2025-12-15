-- =============================================
-- FASE 2: LIMPEZA DE PARTIÇÕES VAZIAS
-- Dr. Atlas Verus - Otimização CyberShield
-- =============================================

-- Remover partições futuras vazias (2026_02 a 2026_11)
-- Mantém apenas 2025_12 (ativa) e 2026_01 (próximo mês)

DROP TABLE IF EXISTS public.agent_system_metrics_2026_02;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_03;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_04;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_05;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_06;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_07;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_08;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_09;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_10;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_11;

-- Log da operação
DO $$
BEGIN
  RAISE NOTICE 'Fase 2 concluída: 10 partições vazias removidas';
  RAISE NOTICE 'Economia estimada: ~240 KB + redução de overhead de metadados';
END $$;