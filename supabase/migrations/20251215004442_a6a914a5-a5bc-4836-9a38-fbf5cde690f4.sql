-- =============================================
-- FASE 3: AJUSTAR FUNÇÃO DE PARTICIONAMENTO
-- Dr. Atlas Verus - Otimização CyberShield
-- =============================================

-- Modificar função para criar apenas mês atual + 1 futuro (não 11)
CREATE OR REPLACE FUNCTION public.create_metrics_partition_if_needed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
  -- OTIMIZAÇÃO: Apenas mês atual (0) + próximo mês (1)
  -- Evita criação prematura de partições vazias
  check_months INTEGER[] := ARRAY[0, 1];
  m INTEGER;
BEGIN
  FOREACH m IN ARRAY check_months LOOP
    start_date := date_trunc('month', CURRENT_DATE + (m || ' months')::INTERVAL)::DATE;
    end_date := (start_date + INTERVAL '1 month')::DATE;
    partition_name := 'agent_system_metrics_' || to_char(start_date, 'YYYY_MM');
    
    -- Verificar se partição existe
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = partition_name AND n.nspname = 'public'
    ) THEN
      BEGIN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.agent_system_metrics_partitioned FOR VALUES FROM (%L) TO (%L)',
          partition_name, start_date, end_date
        );
        RAISE NOTICE 'Partição criada: %', partition_name;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao criar partição %: %', partition_name, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$function$;

-- Log da operação
DO $$
BEGIN
  RAISE NOTICE 'Fase 3 concluída: Função ajustada para criar apenas 2 meses (atual + próximo)';
  RAISE NOTICE 'Benefício: Evita overhead de partições vazias com índices';
END $$;