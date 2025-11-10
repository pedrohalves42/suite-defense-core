-- Habilitar RLS na tabela failed_login_attempts
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

-- Esta tabela é apenas para uso interno (edge functions)
-- Não criar políticas = nenhum acesso público
COMMENT ON TABLE public.failed_login_attempts IS 'Uso interno: rastreamento de tentativas de login falhadas para CAPTCHA';