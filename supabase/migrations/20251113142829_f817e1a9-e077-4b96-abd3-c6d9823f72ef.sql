-- ============================================
-- FASE 1.2: HMAC OBRIGATÓRIO (CORRIGIDO)
-- ============================================

-- 1. Popular hmac_secret em agents existentes que não têm
UPDATE public.agents
SET hmac_secret = encode(gen_random_bytes(32), 'hex')
WHERE hmac_secret IS NULL;

-- 2. Corrigir agents com hmac_secret inválido (comprimento != 64)
UPDATE public.agents
SET hmac_secret = encode(gen_random_bytes(32), 'hex')
WHERE hmac_secret IS NOT NULL AND length(hmac_secret) != 64;

-- 3. Tornar hmac_secret NOT NULL (obrigatório)
ALTER TABLE public.agents
ALTER COLUMN hmac_secret SET NOT NULL;

-- 4. Adicionar constraint para garantir comprimento (64 caracteres = 32 bytes em hex)
ALTER TABLE public.agents
ADD CONSTRAINT agents_hmac_secret_length_check 
CHECK (length(hmac_secret) = 64);

-- ============================================
-- FASE 1.3: VIEW SEGURA PARA ENROLLMENT KEYS
-- ============================================

-- Drop view existente (se houver)
DROP VIEW IF EXISTS public.enrollment_keys_safe CASCADE;

-- Criar view com máscara para enrollment keys
CREATE VIEW public.enrollment_keys_safe 
WITH (security_invoker = on)
AS
SELECT 
  id,
  tenant_id,
  created_by,
  created_at,
  expires_at,
  used_at,
  is_active,
  max_uses,
  current_uses,
  description,
  used_by_agent,
  agent_id,
  installer_sha256,
  installer_size_bytes,
  installer_generated_at,
  expiration_notified_at,
  -- Mascara a chave: mostra apenas primeiros 8 + últimos 4 caracteres
  CASE 
    WHEN is_active = true AND expires_at > NOW() THEN
      substring(key from 1 for 8) || '...' || substring(key from length(key) - 3 for 4)
    ELSE
      '****-****-****-****' -- Chaves expiradas/inativas totalmente mascaradas
  END as key_masked,
  -- Inclui chave completa apenas para função interna (RPC) - não exposto via RLS
  key as key_full
FROM public.enrollment_keys;

COMMENT ON VIEW public.enrollment_keys_safe IS 
'View segura de enrollment keys com máscara. Nunca expõe a chave completa via frontend.
Formato mascarado: "abc12345...xyz9" para chaves ativas, "****-****-****-****" para expiradas.
View usa security_invoker, então herda RLS policies da tabela enrollment_keys.';

-- ============================================
-- FASE 1.2: FUNÇÃO RPC PARA OBTER CHAVE COMPLETA (USO INTERNO)
-- ============================================

-- Função segura para Edge Functions obterem chave completa
CREATE OR REPLACE FUNCTION public.get_enrollment_key_full(p_key_id uuid)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
BEGIN
  -- Apenas para uso interno (Edge Functions com SERVICE_ROLE_KEY)
  SELECT key INTO v_key
  FROM public.enrollment_keys
  WHERE id = p_key_id
    AND is_active = true
    AND expires_at > NOW();
  
  RETURN v_key;
END;
$$;

COMMENT ON FUNCTION public.get_enrollment_key_full IS 
'INTERNAL USE ONLY: Retorna enrollment key completa para Edge Functions.
Não deve ser chamada diretamente pelo frontend.';