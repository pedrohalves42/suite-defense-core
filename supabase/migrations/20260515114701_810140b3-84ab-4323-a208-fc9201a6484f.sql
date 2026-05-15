-- SEC-803: Fix search_path and logic for SECURITY DEFINER functions

-- 1. Hardening is_super_admin to check for platform tenant association
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = 'super_admin'
    AND tenant_id = public.get_platform_tenant_id()
  );
END;
$function$;

-- 2. Hardening validate_enrollment_key_by_hash with search_path
CREATE OR REPLACE FUNCTION public.validate_enrollment_key_by_hash(p_key_hash text)
 RETURNS TABLE(id uuid, tenant_id uuid, agent_id uuid, expires_at timestamp with time zone, max_uses integer, current_uses integer, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ek.id,
    ek.tenant_id,
    ek.agent_id,
    ek.expires_at,
    ek.max_uses,
    ek.current_uses,
    ek.is_active
  FROM public.enrollment_keys ek
  WHERE ek.key_hash = p_key_hash
    AND ek.is_active = true
    AND ek.expires_at > NOW()
  ORDER BY ek.created_at DESC
  LIMIT 1;
END;
$function$;

-- 3. Database Optimization: Add audit timestamps to agents
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'created_at') THEN
        ALTER TABLE public.agents ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'agents' AND column_name = 'updated_at') THEN
        ALTER TABLE public.agents ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- 4. Automatic update for updated_at on agents
DROP TRIGGER IF EXISTS tr_agents_updated_at ON public.agents;
CREATE TRIGGER tr_agents_updated_at
    BEFORE UPDATE ON public.agents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Hardening current_tenant check to bypass JWT-only reliance
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_claim text;
  v_tenant_id uuid;
BEGIN
  -- Extract from JWT claim (fast path)
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  
  IF v_claim IS NULL OR v_claim = '' THEN
    RETURN NULL;
  END IF;

  v_tenant_id := v_claim::uuid;

  -- Verify super_admin bypass (must be in platform tenant)
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
    AND tenant_id = public.get_platform_tenant_id()
  ) THEN
    RETURN v_tenant_id;
  END IF;

  -- Strict validation: user MUST belong to the requested tenant
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND tenant_id = v_tenant_id
  ) THEN
    RETURN v_tenant_id;
  END IF;

  RETURN NULL;
END;
$function$;

-- 6. Performance: Ensure index on critical audit fields
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_action ON public.audit_logs (tenant_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_tenant_type ON public.security_logs (tenant_id, attack_type, created_at DESC);