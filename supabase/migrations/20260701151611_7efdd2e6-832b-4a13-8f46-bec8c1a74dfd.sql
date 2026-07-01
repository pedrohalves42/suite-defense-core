-- HF-RPC-OVERLOAD-AUDIT-01
-- Drop dependent policies, recreate 3-arg has_role WITHOUT default,
-- then recreate the policies so behavior is preserved.

DROP POLICY IF EXISTS "admins_can_upload_agent_scripts_isolated" ON storage.objects;
DROP POLICY IF EXISTS "admins_can_delete_own_installers"         ON storage.objects;
DROP POLICY IF EXISTS "admins_can_delete_own_scripts"            ON storage.objects;
DROP POLICY IF EXISTS "super_admin read pp02b_canary_snapshots"  ON public.pp02b_canary_snapshots;

DROP FUNCTION IF EXISTS public.has_role(uuid, text, uuid);

CREATE FUNCTION public.has_role(
  _user_id uuid,
  _role text,
  _tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role::public.app_role
      AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text, uuid) TO authenticated, service_role;

-- Recreate storage policies (unchanged behavior)
CREATE POLICY "admins_can_upload_agent_scripts_isolated"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'agent-scripts'
    AND (storage.foldername(name))[1] = (get_active_tenant_id())::text
    AND has_role(auth.uid(), 'admin'::text, get_active_tenant_id())
  );

CREATE POLICY "admins_can_delete_own_installers"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'agent-installers'
    AND (storage.foldername(name))[1] = (get_active_tenant_id())::text
    AND has_role(auth.uid(), 'admin'::text, get_active_tenant_id())
  );

CREATE POLICY "admins_can_delete_own_scripts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'agent-scripts'
    AND (storage.foldername(name))[1] = (get_active_tenant_id())::text
    AND has_role(auth.uid(), 'admin'::text, get_active_tenant_id())
  );

-- Recreate pp02b policy using the unambiguous 2-arg (app_role) overload
CREATE POLICY "super_admin read pp02b_canary_snapshots"
  ON public.pp02b_canary_snapshots
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Regression guard
DO $$
DECLARE
  v_two_arg int;
  v_three_arg int;
  v_defaults int;
BEGIN
  SELECT COUNT(*) INTO v_two_arg
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='has_role'
    AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _role app_role';

  SELECT COUNT(*), COALESCE(MAX(pronargdefaults),0)
  INTO v_three_arg, v_defaults
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='has_role'
    AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _role text, _tenant_id uuid';

  IF v_two_arg <> 1 THEN
    RAISE EXCEPTION 'HF-RPC-OVERLOAD-AUDIT-01: expected exactly 1 two-arg has_role overload, found %', v_two_arg;
  END IF;
  IF v_three_arg <> 1 THEN
    RAISE EXCEPTION 'HF-RPC-OVERLOAD-AUDIT-01: expected exactly 1 three-arg has_role overload, found %', v_three_arg;
  END IF;
  IF v_defaults <> 0 THEN
    RAISE EXCEPTION 'HF-RPC-OVERLOAD-AUDIT-01: three-arg has_role must not declare default values (found %)', v_defaults;
  END IF;

  RAISE NOTICE 'HF-RPC-OVERLOAD-AUDIT-01: has_role overloads are unambiguous';
END $$;