-- ============================================
-- FASE 3: Ativar Particionamento de Metricas
-- ============================================

-- 1. Criar funcao para redirecionar inserts para particoes mensais
CREATE OR REPLACE FUNCTION public.redirect_metrics_to_partition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  partition_name text;
  partition_start date;
  partition_end date;
BEGIN
  partition_start := date_trunc('month', NEW.collected_at)::date;
  partition_end := (partition_start + interval '1 month')::date;
  partition_name := 'agent_system_metrics_' || to_char(partition_start, 'YYYY_MM');
  
  -- Criar particao se nao existir
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = partition_name AND n.nspname = 'public'
  ) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.agent_system_metrics_partitioned FOR VALUES FROM (%L) TO (%L)',
      partition_name, partition_start, partition_end
    );
    RAISE NOTICE 'Created partition: %', partition_name;
  END IF;
  
  -- Inserir na tabela particionada
  INSERT INTO public.agent_system_metrics_partitioned (
    id, agent_id, tenant_id, collected_at, created_at,
    cpu_usage_percent, cpu_cores, cpu_name,
    memory_usage_percent, memory_total_gb, memory_used_gb, memory_free_gb,
    disk_usage_percent, disk_total_gb, disk_used_gb, disk_free_gb,
    network_bytes_sent, network_bytes_received,
    uptime_seconds, last_boot_time
  ) VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.agent_id, NEW.tenant_id, NEW.collected_at, COALESCE(NEW.created_at, now()),
    NEW.cpu_usage_percent, NEW.cpu_cores, NEW.cpu_name,
    NEW.memory_usage_percent, NEW.memory_total_gb, NEW.memory_used_gb, NEW.memory_free_gb,
    NEW.disk_usage_percent, NEW.disk_total_gb, NEW.disk_used_gb, NEW.disk_free_gb,
    NEW.network_bytes_sent, NEW.network_bytes_received,
    NEW.uptime_seconds, NEW.last_boot_time
  );
  
  RETURN NULL; -- Impede insert na tabela original
END;
$$;

-- 2. Criar trigger na tabela principal (se nao existir)
DROP TRIGGER IF EXISTS tr_redirect_metrics_to_partition ON public.agent_system_metrics;

CREATE TRIGGER tr_redirect_metrics_to_partition
BEFORE INSERT ON public.agent_system_metrics
FOR EACH ROW
EXECUTE FUNCTION public.redirect_metrics_to_partition();

-- 3. Garantir particao atual existe
DO $$
DECLARE
  partition_name text;
  partition_start date;
  partition_end date;
BEGIN
  partition_start := date_trunc('month', CURRENT_DATE)::date;
  partition_end := (partition_start + interval '1 month')::date;
  partition_name := 'agent_system_metrics_' || to_char(partition_start, 'YYYY_MM');
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = partition_name AND n.nspname = 'public'
  ) THEN
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.agent_system_metrics_partitioned FOR VALUES FROM (%L) TO (%L)',
      partition_name, partition_start, partition_end
    );
    RAISE NOTICE 'Created current month partition: %', partition_name;
  END IF;
END;
$$;

-- ============================================
-- FASE 2: Token Hashing para agent_tokens
-- ============================================

-- 1. Adicionar colunas para hash
ALTER TABLE public.agent_tokens 
ADD COLUMN IF NOT EXISTS token_hash text,
ADD COLUMN IF NOT EXISTS token_prefix varchar(12);

-- 2. Criar indice para busca eficiente por hash
CREATE INDEX IF NOT EXISTS idx_agent_tokens_token_hash 
ON public.agent_tokens(token_hash) 
WHERE token_hash IS NOT NULL;

-- 3. Migrar tokens existentes para formato hash
UPDATE public.agent_tokens 
SET 
  token_hash = encode(sha256(token::bytea), 'hex'),
  token_prefix = left(token, 8) || '...'
WHERE token_hash IS NULL AND token IS NOT NULL;

-- 4. Criar funcao SQL para hash de token
CREATE OR REPLACE FUNCTION public.hash_agent_token(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(sha256(p_token::bytea), 'hex');
$$;

-- 5. Tornar colunas NOT NULL apos migracao (apenas se todos preenchidos)
DO $$
BEGIN
  -- Verificar se todos tokens tem hash
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_tokens 
    WHERE token_hash IS NULL AND token IS NOT NULL
  ) THEN
    -- Aplicar NOT NULL apenas se todos estao preenchidos
    ALTER TABLE public.agent_tokens ALTER COLUMN token_hash SET NOT NULL;
    ALTER TABLE public.agent_tokens ALTER COLUMN token_prefix SET NOT NULL;
    RAISE NOTICE 'Applied NOT NULL constraints to token_hash and token_prefix';
  END IF;
END;
$$;