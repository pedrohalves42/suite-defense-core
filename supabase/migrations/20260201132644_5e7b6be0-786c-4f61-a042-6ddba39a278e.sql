-- ============================================================================
-- Criar particoes HMAC Fevereiro-Junho 2026 (INV-002 Nullmann)
-- ============================================================================

-- Criar particao Fevereiro 2026 (URGENTE)
CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_02 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Criar particoes futuras para prevenir recorrencia
CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_03 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_04 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_05 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

CREATE TABLE IF NOT EXISTS public.hmac_signatures_2026_06 
  PARTITION OF public.hmac_signatures
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

-- Criar indices nas novas particoes
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_02_signature 
  ON public.hmac_signatures_2026_02(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_02_used_at 
  ON public.hmac_signatures_2026_02(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_03_signature 
  ON public.hmac_signatures_2026_03(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_03_used_at 
  ON public.hmac_signatures_2026_03(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_04_signature 
  ON public.hmac_signatures_2026_04(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_04_used_at 
  ON public.hmac_signatures_2026_04(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_05_signature 
  ON public.hmac_signatures_2026_05(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_05_used_at 
  ON public.hmac_signatures_2026_05(used_at);

CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_06_signature 
  ON public.hmac_signatures_2026_06(signature);
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_2026_06_used_at 
  ON public.hmac_signatures_2026_06(used_at);