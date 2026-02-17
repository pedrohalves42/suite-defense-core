CREATE OR REPLACE FUNCTION public.get_mfa_user_count(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_users', COUNT(DISTINCT ur.user_id),
    'users_with_mfa', COUNT(DISTINCT CASE WHEN mf.id IS NOT NULL THEN ur.user_id END)
  )
  FROM user_roles ur
  LEFT JOIN auth.mfa_factors mf ON mf.user_id = ur.user_id AND mf.status = 'verified'
  WHERE ur.tenant_id = p_tenant_id;
$$;