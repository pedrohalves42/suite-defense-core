-- Criar tabela para rastrear tentativas de login falhadas
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  email TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para melhorar performance nas consultas por IP e data
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_ip_created 
ON public.failed_login_attempts(ip_address, created_at DESC);

-- Índice para consultas por email
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email 
ON public.failed_login_attempts(email, created_at DESC);

-- Habilitar RLS (sem policies - apenas edge functions devem acessar)
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Criar tabela para lista de IPs bloqueados
CREATE TABLE IF NOT EXISTS public.ip_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL UNIQUE,
  blocked_until TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice para melhorar performance nas consultas por IP
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_ip_blocked 
ON public.ip_blocklist(ip_address, blocked_until);

-- Habilitar RLS (sem policies - apenas edge functions devem acessar)
ALTER TABLE public.ip_blocklist ENABLE ROW LEVEL SECURITY;

-- Função para limpar tentativas antigas (mais de 24 horas)
CREATE OR REPLACE FUNCTION cleanup_old_failed_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.failed_login_attempts
  WHERE created_at < now() - interval '24 hours';
  
  DELETE FROM public.ip_blocklist
  WHERE blocked_until < now();
END;
$$;

-- Comentários para documentação
COMMENT ON TABLE public.failed_login_attempts IS 'Rastreia tentativas de login falhadas para prevenção de brute-force';
COMMENT ON TABLE public.ip_blocklist IS 'Lista de IPs temporariamente bloqueados por tentativas excessivas';
COMMENT ON FUNCTION cleanup_old_failed_attempts IS 'Remove registros antigos de tentativas falhadas e IPs bloqueados expirados';