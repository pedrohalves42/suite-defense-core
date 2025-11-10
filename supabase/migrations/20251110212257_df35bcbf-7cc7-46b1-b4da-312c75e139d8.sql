-- Tabela para logar tentativas de ataque e validações falhadas
CREATE TABLE IF NOT EXISTS public.security_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID,
  ip_address TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  attack_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  blocked BOOLEAN NOT NULL DEFAULT true,
  details JSONB,
  user_agent TEXT,
  request_id TEXT
);

-- Index para consultas rápidas
CREATE INDEX idx_security_logs_created_at ON public.security_logs(created_at DESC);
CREATE INDEX idx_security_logs_tenant_id ON public.security_logs(tenant_id);
CREATE INDEX idx_security_logs_ip_address ON public.security_logs(ip_address);
CREATE INDEX idx_security_logs_attack_type ON public.security_logs(attack_type);
CREATE INDEX idx_security_logs_severity ON public.security_logs(severity);

-- RLS para security_logs
ALTER TABLE public.security_logs ENABLE ROW LEVEL SECURITY;

-- Admins podem ver logs de segurança do seu tenant
CREATE POLICY "Admins can view security logs in their tenant"
ON public.security_logs
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') AND 
  (tenant_id = current_user_tenant_id() OR tenant_id IS NULL)
);

-- Super admins podem ver todos os logs
CREATE POLICY "Super admins can view all security logs"
ON public.security_logs
FOR SELECT
USING (is_super_admin(auth.uid()));

-- Ninguém pode modificar logs (apenas inserção via service role)
CREATE POLICY "No one can modify security logs"
ON public.security_logs
FOR UPDATE
USING (false);

CREATE POLICY "No one can delete security logs"
ON public.security_logs
FOR DELETE
USING (false);

-- Função para limpar logs antigos (manter últimos 90 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_security_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.security_logs
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;

COMMENT ON TABLE public.security_logs IS 'Logs de tentativas de ataque e validações de segurança falhadas';
COMMENT ON COLUMN public.security_logs.attack_type IS 'Tipo de ataque: sql_injection, xss, path_traversal, rate_limit, invalid_input, etc';
COMMENT ON COLUMN public.security_logs.severity IS 'Severidade: low, medium, high, critical';