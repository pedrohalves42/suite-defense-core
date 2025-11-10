-- Tabela para rastrear tentativas de login falhadas
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_agent TEXT
);

-- Index para consultas rápidas
CREATE INDEX idx_failed_login_ip ON public.failed_login_attempts(ip_address, created_at DESC);

-- Função para limpar tentativas antigas (últimas 24h)
CREATE OR REPLACE FUNCTION public.cleanup_old_failed_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.failed_login_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;

COMMENT ON TABLE public.failed_login_attempts IS 'Rastreamento de tentativas de login falhadas para CAPTCHA';