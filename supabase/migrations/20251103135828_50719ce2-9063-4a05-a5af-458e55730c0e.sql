-- PRIORIDADE 1: Implementar RLS Seguro com Sistema de Roles

-- 1. Criar enum para roles da aplicação
CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'viewer');

-- 2. Criar tabela de user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, role)
);

-- 3. Criar índices para performance
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- 4. Habilitar RLS na tabela user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 5. Criar função SECURITY DEFINER para checar roles (evita recursão)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role
  )
$$;

-- 6. Políticas RLS para user_roles
CREATE POLICY "Admins podem gerenciar todos os roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuários podem ver seus próprios roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 7. REMOVER políticas públicas antigas da tabela agents
DROP POLICY IF EXISTS "Block public access to agents" ON public.agents;
DROP POLICY IF EXISTS "Service role can manage agents" ON public.agents;

-- 8. Criar novas políticas RLS para agents
CREATE POLICY "Service role tem acesso total aos agents"
  ON public.agents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins podem gerenciar todos os agents"
  ON public.agents
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators e viewers podem ler agents"
  ON public.agents
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'operator') OR 
    public.has_role(auth.uid(), 'viewer')
  );

-- 9. REMOVER políticas públicas antigas da tabela jobs
DROP POLICY IF EXISTS "Block public access to jobs" ON public.jobs;
DROP POLICY IF EXISTS "Service role can manage jobs" ON public.jobs;

-- 10. Criar novas políticas RLS para jobs
CREATE POLICY "Service role tem acesso total aos jobs"
  ON public.jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins podem gerenciar todos os jobs"
  ON public.jobs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators podem criar e ler jobs"
  ON public.jobs
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'operator') OR 
    public.has_role(auth.uid(), 'viewer')
  );

CREATE POLICY "Operators podem inserir jobs"
  ON public.jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'operator'));

CREATE POLICY "Operators podem atualizar jobs"
  ON public.jobs
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'operator'));

-- 11. REMOVER políticas públicas antigas da tabela reports
DROP POLICY IF EXISTS "Block public access to reports" ON public.reports;
DROP POLICY IF EXISTS "Service role can manage reports" ON public.reports;

-- 12. Criar novas políticas RLS para reports
CREATE POLICY "Service role tem acesso total aos reports"
  ON public.reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins podem gerenciar todos os reports"
  ON public.reports
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators e viewers podem ler reports"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'operator') OR 
    public.has_role(auth.uid(), 'viewer')
  );

-- 13. PRIORIDADE 2: Criar tabela de enrollment_keys dinâmicas
CREATE TABLE public.enrollment_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_uses INTEGER NOT NULL DEFAULT 1,
  current_uses INTEGER NOT NULL DEFAULT 0,
  description TEXT
);

-- 14. Criar índices para enrollment_keys
CREATE INDEX idx_enrollment_keys_key ON public.enrollment_keys(key);
CREATE INDEX idx_enrollment_keys_expires_at ON public.enrollment_keys(expires_at);
CREATE INDEX idx_enrollment_keys_created_by ON public.enrollment_keys(created_by);
CREATE INDEX idx_enrollment_keys_active ON public.enrollment_keys(is_active) WHERE is_active = true;

-- 15. Habilitar RLS na tabela enrollment_keys
ALTER TABLE public.enrollment_keys ENABLE ROW LEVEL SECURITY;

-- 16. Políticas RLS para enrollment_keys
CREATE POLICY "Service role tem acesso total aos enrollment_keys"
  ON public.enrollment_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins podem gerenciar enrollment_keys"
  ON public.enrollment_keys
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Operators podem ver enrollment_keys"
  ON public.enrollment_keys
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));

-- 17. Criar função para limpar chaves expiradas
CREATE OR REPLACE FUNCTION public.cleanup_expired_keys()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.enrollment_keys
  SET is_active = false
  WHERE expires_at < now() AND is_active = true;
END;
$$;

COMMENT ON TABLE public.user_roles IS 'Tabela de roles de usuários do sistema';
COMMENT ON TABLE public.enrollment_keys IS 'Chaves dinâmicas de enrollment com expiração e limite de uso';
COMMENT ON FUNCTION public.has_role IS 'Função SECURITY DEFINER para verificar role do usuário sem recursão RLS';
COMMENT ON FUNCTION public.cleanup_expired_keys IS 'Função para desativar chaves de enrollment expiradas';