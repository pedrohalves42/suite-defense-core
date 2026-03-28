-- =============================================
-- FASE 3: AJUSTAR FUNCAO DE PARTICIONAMENTO
-- Dr. Atlas Verus - Otimizacao CyberShield
-- =============================================

-- Modificar funcao para criar apenas mes atual + 1 futuro (nao 11)
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
  -- OTIMIZACAO: Apenas mes atual (0) + proximo mes (1)
  -- Evita criacao prematura de particoes vazias
  check_months INTEGER[] := ARRAY[0, 1];
  m INTEGER;
BEGIN
  FOREACH m IN ARRAY check_months LOOP
    start_date := date_trunc('month', CURRENT_DATE + (m || ' months')::INTERVAL)::DATE;
    end_date := (start_date + INTERVAL '1 month')::DATE;
    partition_name := 'agent_system_metrics_' || to_char(start_date, 'YYYY_MM');
    
    -- Verificar se particao existe
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
        RAISE NOTICE 'Particao criada: %', partition_name;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Erro ao criar particao %: %', partition_name, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$function$;

-- Log da operacao
DO $$
BEGIN
  RAISE NOTICE 'Fase 3 concluida: Funcao ajustada para criar apenas 2 meses (atual + proximo)';
  RAISE NOTICE 'Beneficio: Evita overhead de particoes vazias com indices';
END $$;