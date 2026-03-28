-- Adicionar campos de break glass na tabela tenants
ALTER TABLE tenants 
ADD COLUMN IF NOT EXISTS break_glass_user_id UUID,
ADD COLUMN IF NOT EXISTS break_glass_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS break_glass_last_used_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS break_glass_last_used_by UUID;

-- Atualizar comentario do mfa_policy
COMMENT ON COLUMN tenants.mfa_policy IS 'MFA policy config: require_mfa_all_users, require_mfa_roles[], mfa_grace_period_hours, grace_exempt_roles[], break_glass settings';

-- Criar funcao para verificar se usuario e break glass
CREATE OR REPLACE FUNCTION public.is_break_glass_user(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenants
    WHERE id = _tenant_id
      AND break_glass_enabled = true
      AND break_glass_user_id = _user_id
  )
$$;

-- Atualizar RPC update_user_role para bloquear analyst
CREATE OR REPLACE FUNCTION public.update_user_role(
  _target_user_id UUID,
  _new_role app_role,
  _requester_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_role app_role;
  actual_requester_id UUID;
BEGIN
  -- Usar auth.uid() se requester_id nao fornecido
  actual_requester_id := COALESCE(_requester_id, auth.uid());
  
  -- Buscar role do requisitante
  SELECT role INTO requester_role 
  FROM user_roles 
  WHERE user_id = actual_requester_id
  LIMIT 1;
  
  -- Analyst NAO pode alterar roles
  IF requester_role = 'analyst' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Analyst role cannot modify user roles',
      'code', 'ANALYST_DENIED'
    );
  END IF;
  
  -- Viewer NAO pode alterar roles
  IF requester_role = 'viewer' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Viewer role cannot modify user roles',
      'code', 'VIEWER_DENIED'
    );
  END IF;
  
  -- Operator NAO pode alterar roles
  IF requester_role = 'operator' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Operator role cannot modify user roles',
      'code', 'OPERATOR_DENIED'
    );
  END IF;
  
  -- Apenas admin e super_admin podem prosseguir
  IF requester_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions to modify roles',
      'code', 'INSUFFICIENT_PERMISSIONS'
    );
  END IF;
  
  -- Admin nao pode criar super_admin
  IF requester_role = 'admin' AND _new_role = 'super_admin' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Admin cannot assign super_admin role',
      'code', 'ESCALATION_DENIED'
    );
  END IF;
  
  -- Atualizar role
  UPDATE user_roles 
  SET role = _new_role,
      updated_at = NOW()
  WHERE user_id = _target_user_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'User role not found',
      'code', 'NOT_FOUND'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'new_role', _new_role::text
  );
END;
$$;