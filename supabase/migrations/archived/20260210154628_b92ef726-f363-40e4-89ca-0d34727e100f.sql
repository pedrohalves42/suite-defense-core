
-- Fix get_active_tenant_id() to read from correct JWT path (app_metadata)
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
BEGIN
  -- FIXED: Read from app_metadata object inside JWT claims
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  
  IF v_claim IS NOT NULL AND v_claim != '' THEN
    v_tenant_id := v_claim::uuid;
  ELSE
    IF random() < 0.01 THEN
      RAISE LOG '[get_active_tenant_id] No active_tenant_id in JWT app_metadata (sampled 1%%)';
    END IF;
    v_tenant_id := NULL;
  END IF;
  
  RETURN v_tenant_id;
END;
$$;

-- Add bootstrap RLS policy: users can view tenants they belong to via user_roles
-- This uses SECURITY DEFINER function to avoid recursion with user_roles RLS
CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;

-- Add fallback SELECT policy on tenants for bootstrap
CREATE POLICY "Users can view tenants they belong to"
ON public.tenants FOR SELECT TO authenticated
USING (
  user_belongs_to_tenant(auth.uid(), id)
);
