-- Fix get_active_tenant_id() to fallback to user_roles when JWT claim is missing
-- This prevents ALL dashboards from showing empty data during JWT sync window
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_claim text;
  v_user_id uuid;
BEGIN
  -- Primary: Read from app_metadata in JWT
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  
  IF v_claim IS NOT NULL AND v_claim != '' THEN
    v_tenant_id := v_claim::uuid;
    RETURN v_tenant_id;
  END IF;

  -- Fallback: Look up from user_roles using auth.uid()
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT ur.tenant_id INTO v_tenant_id
    FROM public.user_roles ur
    WHERE ur.user_id = v_user_id
    ORDER BY ur.created_at ASC
    LIMIT 1;
    
    IF v_tenant_id IS NOT NULL THEN
      IF random() < 0.01 THEN
        RAISE LOG '[get_active_tenant_id] Fallback to user_roles for user %, tenant % (sampled 1%%)', v_user_id, v_tenant_id;
      END IF;
      RETURN v_tenant_id;
    END IF;
  END IF;

  -- No tenant found
  IF random() < 0.01 THEN
    RAISE LOG '[get_active_tenant_id] No tenant found for user % (sampled 1%%)', v_user_id;
  END IF;
  RETURN NULL;
END;
$$;