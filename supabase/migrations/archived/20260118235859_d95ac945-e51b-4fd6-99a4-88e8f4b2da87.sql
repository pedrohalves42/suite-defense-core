-- ADR-026 P1.1: IP Whitelist para super_admin
-- ADR-026 P1.2: Session Timeout por role
-- ADR-026 P2.2: Session Recording para auditorias

-- =============================================
-- P1.1: IP Whitelist Table
-- =============================================
CREATE TABLE IF NOT EXISTS public.admin_ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ip_address CIDR NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(tenant_id, ip_address)
);

-- RLS para isolamento
ALTER TABLE admin_ip_whitelist ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_ip_whitelist_super_admin ON admin_ip_whitelist
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Funcao de verificacao de IP
CREATE OR REPLACE FUNCTION check_super_admin_ip_access(
  _user_id UUID,
  _ip_address TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super_admin BOOLEAN;
  _ip_allowed BOOLEAN;
  _has_whitelist BOOLEAN;
BEGIN
  -- Verificar se e super_admin
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = _user_id AND role = 'super_admin'
  ) INTO _is_super_admin;

  -- Se nao e super_admin, permite acesso normal
  IF NOT _is_super_admin THEN
    RETURN TRUE;
  END IF;

  -- Verificar se existe whitelist configurada
  SELECT EXISTS(
    SELECT 1 FROM admin_ip_whitelist WHERE is_active = true
  ) INTO _has_whitelist;

  -- Se nao existe whitelist, permite acesso (para nao bloquear durante setup)
  IF NOT _has_whitelist THEN
    RETURN TRUE;
  END IF;

  -- Verificar IP na whitelist (NULL tenant_id = global)
  SELECT EXISTS(
    SELECT 1 FROM admin_ip_whitelist
    WHERE is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND _ip_address::inet <<= ip_address
  ) INTO _ip_allowed;

  RETURN _ip_allowed;
END;
$$;

-- Inserir IPs padrao para desenvolvimento
INSERT INTO admin_ip_whitelist (ip_address, description, tenant_id) 
VALUES 
  ('127.0.0.1/32', 'Localhost IPv4', NULL),
  ('::1/128', 'Localhost IPv6', NULL),
  ('10.0.0.0/8', 'Private Network Class A', NULL),
  ('172.16.0.0/12', 'Private Network Class B', NULL),
  ('192.168.0.0/16', 'Private Network Class C', NULL)
ON CONFLICT (tenant_id, ip_address) DO NOTHING;

-- =============================================
-- P1.2: Session Timeout Configuration
-- =============================================
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS session_timeout_minutes JSONB 
DEFAULT '{"super_admin": 15, "admin": 60, "user": 480}'::jsonb;

-- Funcao para obter timeout de sessao por role
CREATE OR REPLACE FUNCTION get_session_timeout_minutes(_role TEXT)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _timeout INTEGER;
BEGIN
  SELECT COALESCE(
    (SELECT (t.session_timeout_minutes->>_role)::INTEGER
     FROM tenants t
     WHERE t.id = (
       SELECT ((auth.jwt()->'app_metadata')::jsonb->>'active_tenant_id')::UUID
     )),
    CASE _role
      WHEN 'super_admin' THEN 15
      WHEN 'admin' THEN 60
      ELSE 480
    END
  ) INTO _timeout;
  
  RETURN _timeout;
END;
$$;

-- =============================================
-- P2.2: Active Sessions Table
-- =============================================
CREATE TABLE IF NOT EXISTS public.active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  session_token_hash TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_super_admin BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_expires ON active_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_active_sessions_tenant ON active_sessions(tenant_id);

-- RLS
ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY active_sessions_own ON active_sessions
FOR ALL USING (user_id = auth.uid());

CREATE POLICY active_sessions_super_admin ON active_sessions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  )
);

-- Funcao para registrar inicio de sessao
CREATE OR REPLACE FUNCTION log_session_start(
  _ip_address TEXT,
  _user_agent TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session_id UUID;
  _user_id UUID;
  _is_super_admin BOOLEAN;
  _timeout_minutes INTEGER;
BEGIN
  _user_id := auth.uid();
  
  IF _user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Verificar se e super_admin
  SELECT EXISTS(
    SELECT 1 FROM user_roles 
    WHERE user_id = _user_id AND role = 'super_admin'
  ) INTO _is_super_admin;

  -- Calcular timeout
  _timeout_minutes := CASE WHEN _is_super_admin THEN 15 ELSE 480 END;

  -- Limpar sessoes antigas do mesmo usuario
  DELETE FROM active_sessions 
  WHERE user_id = _user_id 
    AND (expires_at < now() OR last_activity_at < now() - interval '1 day');

  -- Inserir nova sessao
  INSERT INTO active_sessions (
    user_id, 
    tenant_id,
    ip_address, 
    user_agent, 
    expires_at, 
    is_super_admin
  ) VALUES (
    _user_id,
    ((auth.jwt()->'app_metadata')::jsonb->>'active_tenant_id')::UUID,
    _ip_address,
    _user_agent,
    now() + (_timeout_minutes || ' minutes')::interval,
    _is_super_admin
  ) RETURNING id INTO _session_id;

  RETURN _session_id;
END;
$$;

-- Funcao para atualizar atividade da sessao
CREATE OR REPLACE FUNCTION update_session_activity(_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_super_admin BOOLEAN;
  _timeout_minutes INTEGER;
BEGIN
  SELECT is_super_admin INTO _is_super_admin
  FROM active_sessions WHERE id = _session_id;
  
  _timeout_minutes := CASE WHEN _is_super_admin THEN 15 ELSE 480 END;

  UPDATE active_sessions 
  SET last_activity_at = now(),
      expires_at = now() + (_timeout_minutes || ' minutes')::interval
  WHERE id = _session_id
    AND user_id = auth.uid();
END;
$$;

-- Funcao para cleanup de sessoes expiradas
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INTEGER;
BEGIN
  DELETE FROM active_sessions WHERE expires_at < now();
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;