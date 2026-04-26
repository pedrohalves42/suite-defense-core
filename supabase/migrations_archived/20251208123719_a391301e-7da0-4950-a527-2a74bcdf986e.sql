-- =====================================================
-- FASE 2: Particionamento Mensal de agent_system_metrics
-- Para escala de 10.000+ agentes
-- =====================================================

-- 1. Criar funcao para auto-criar particoes futuras
CREATE OR REPLACE FUNCTION public.create_metrics_partition_if_needed()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
  check_months INTEGER[] := ARRAY[0, 1, 2]; -- current + next 2 months
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
$$;

-- 2. Criar funcao para cleanup de particoes antigas (>90 dias)
CREATE OR REPLACE FUNCTION public.drop_old_metrics_partitions(retention_months INTEGER DEFAULT 3)
RETURNS TABLE(partition_dropped TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  partition_rec RECORD;
  cutoff_date DATE;
  partition_date DATE;
BEGIN
  cutoff_date := date_trunc('month', CURRENT_DATE - (retention_months || ' months')::INTERVAL)::DATE;
  
  FOR partition_rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE i.inhparent = 'public.agent_system_metrics_partitioned'::regclass
      AND n.nspname = 'public'
      AND c.relname ~ '^agent_system_metrics_\d{4}_\d{2}$'
  LOOP
    -- Extrair data da particao
    BEGIN
      partition_date := to_date(substring(partition_rec.relname from 'agent_system_metrics_(\d{4}_\d{2})'), 'YYYY_MM');
      
      IF partition_date < cutoff_date THEN
        EXECUTE format('DROP TABLE IF EXISTS public.%I', partition_rec.relname);
        partition_dropped := partition_rec.relname;
        RETURN NEXT;
        RAISE NOTICE 'Particao removida: %', partition_rec.relname;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Erro ao processar particao %: %', partition_rec.relname, SQLERRM;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- 3. Criar nova tabela particionada (sem remover a antiga ainda)
CREATE TABLE IF NOT EXISTS public.agent_system_metrics_partitioned (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  cpu_usage_percent numeric,
  cpu_name text,
  cpu_cores integer,
  memory_total_gb numeric,
  memory_used_gb numeric,
  memory_free_gb numeric,
  memory_usage_percent numeric,
  disk_total_gb numeric,
  disk_used_gb numeric,
  disk_free_gb numeric,
  disk_usage_percent numeric,
  network_bytes_sent bigint,
  network_bytes_received bigint,
  uptime_seconds bigint,
  last_boot_time timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, collected_at)
) PARTITION BY RANGE (collected_at);

-- 4. Criar particoes para os proximos 12 meses
DO $$
DECLARE
  m INTEGER;
  start_date DATE;
  end_date DATE;
  partition_name TEXT;
BEGIN
  FOR m IN 0..11 LOOP
    start_date := date_trunc('month', CURRENT_DATE + (m || ' months')::INTERVAL)::DATE;
    end_date := (start_date + INTERVAL '1 month')::DATE;
    partition_name := 'agent_system_metrics_' || to_char(start_date, 'YYYY_MM');
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = partition_name AND n.nspname = 'public'
    ) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.agent_system_metrics_partitioned FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
      );
      RAISE NOTICE 'Particao criada: %', partition_name;
    END IF;
  END LOOP;
END $$;

-- 5. Criar indices na tabela particionada
CREATE INDEX IF NOT EXISTS idx_metrics_part_tenant_collected 
  ON public.agent_system_metrics_partitioned (tenant_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_part_agent_collected 
  ON public.agent_system_metrics_partitioned (agent_id, collected_at DESC);

-- 6. Habilitar RLS na tabela particionada
ALTER TABLE public.agent_system_metrics_partitioned ENABLE ROW LEVEL SECURITY;

-- 7. Criar policies RLS (mesmas da tabela original)
CREATE POLICY "Admins can view tenant metrics" 
  ON public.agent_system_metrics_partitioned 
  FOR SELECT 
  USING (tenant_id IN (
    SELECT user_roles.tenant_id FROM user_roles 
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role
  ));

CREATE POLICY "Super admins can view all metrics" 
  ON public.agent_system_metrics_partitioned 
  FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'super_admin'::app_role
  ));

-- 8. Criar view unificada para compatibilidade
CREATE OR REPLACE VIEW public.agent_system_metrics_unified AS
SELECT * FROM public.agent_system_metrics
UNION ALL
SELECT * FROM public.agent_system_metrics_partitioned
WHERE collected_at >= CURRENT_DATE - INTERVAL '90 days';

-- 9. Comentarios para documentacao
COMMENT ON TABLE public.agent_system_metrics_partitioned IS 
'Tabela particionada por mes para metricas de sistema. Escala para 10.000+ agentes. Use agent_system_metrics_unified para queries que precisam de dados historicos.';

COMMENT ON FUNCTION public.create_metrics_partition_if_needed() IS 
'Cria particoes futuras automaticamente. Execute periodicamente via cron ou Edge Function.';

COMMENT ON FUNCTION public.drop_old_metrics_partitions(INTEGER) IS 
'Remove particoes antigas apos periodo de retencao (default: 3 meses). Execute mensalmente.';