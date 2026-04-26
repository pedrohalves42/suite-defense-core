-- FIX: Criar tabela particionada hmac_signatures_partitioned completa

-- 1. Criar tabela particionada principal
CREATE TABLE IF NOT EXISTS public.hmac_signatures_partitioned (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  signature text NOT NULL,
  agent_name text NOT NULL,
  used_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id, used_at)
) PARTITION BY RANGE (used_at);

-- 2. Criar particao dezembro 2025 (atual)
CREATE TABLE IF NOT EXISTS public.hmac_signatures_2025_12 
  PARTITION OF public.hmac_signatures_partitioned
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- 3. Criar particoes futuras
CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_01 
  PARTITION OF public.hmac_signatures_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_02 
  PARTITION OF public.hmac_signatures_partitioned
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_03 
  PARTITION OF public.hmac_signatures_partitioned
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- 4. Criar indices para performance
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_part_signature 
  ON public.hmac_signatures_partitioned(signature);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_part_used_at 
  ON public.hmac_signatures_partitioned(used_at);

-- 5. Habilitar RLS
ALTER TABLE public.hmac_signatures_partitioned ENABLE ROW LEVEL SECURITY;

-- 6. Criar politica RLS (sem acesso publico)
DROP POLICY IF EXISTS "No public access to hmac signatures partitioned" ON public.hmac_signatures_partitioned;
CREATE POLICY "No public access to hmac signatures partitioned"
ON public.hmac_signatures_partitioned
FOR SELECT
TO authenticated
USING (false);

-- 7. Migrar dados existentes (ultimas 6 horas)
INSERT INTO public.hmac_signatures_partitioned (id, signature, agent_name, used_at)
SELECT id, signature, agent_name, used_at
FROM public.hmac_signatures
WHERE used_at > NOW() - INTERVAL '6 hours'
ON CONFLICT DO NOTHING;