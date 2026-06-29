
DO $$
DECLARE
  v_tenant_id uuid := 'a0000000-0000-0000-0000-000000000001';
  v_super_email text := 'super@cybershield.test';
  v_viewer_email text := 'viewer@cybershield.test';
  v_super_id uuid;
  v_viewer_id uuid;
BEGIN
  SELECT id INTO v_super_id FROM auth.users WHERE email = v_super_email;
  SELECT id INTO v_viewer_id FROM auth.users WHERE email = v_viewer_email;

  UPDATE auth.users
  SET email_confirmed_at = now()
  WHERE email IN (v_super_email, v_viewer_email)
    AND email_confirmed_at IS NULL;

  ALTER TABLE public.user_roles DISABLE TRIGGER guard_super_admin_role;

  IF v_super_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles
                     WHERE user_id = v_super_id AND tenant_id = v_tenant_id) THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_super_id, v_tenant_id, 'super_admin');
  END IF;

  IF v_viewer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles
                     WHERE user_id = v_viewer_id AND tenant_id = v_tenant_id) THEN
    INSERT INTO public.user_roles (user_id, tenant_id, role)
    VALUES (v_viewer_id, v_tenant_id, 'viewer');
  END IF;

  ALTER TABLE public.user_roles ENABLE TRIGGER guard_super_admin_role;
END $$;
