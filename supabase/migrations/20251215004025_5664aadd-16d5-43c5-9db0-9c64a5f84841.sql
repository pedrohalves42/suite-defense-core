-- =============================================
-- FASE 2: LIMPEZA DE PARTICOES VAZIAS
-- Dr. Atlas Verus - Otimizacao CyberShield
-- =============================================

-- Remover particoes futuras vazias (2026_02 a 2026_11)
-- Mantem apenas 2025_12 (ativa) e 2026_01 (proximo mes)

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

-- Log da operacao
DO $$
BEGIN
  RAISE NOTICE 'Fase 2 concluida: 10 particoes vazias removidas';
  RAISE NOTICE 'Economia estimada: ~240 KB + reducao de overhead de metadados';
END $$;