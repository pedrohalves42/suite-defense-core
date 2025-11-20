-- ============================================================================
-- P1.4: Query de Diagnostico de Consistencia de Limites
-- Verifica discrepancias entre subscription_plans e tenant_features
-- ============================================================================

-- Buscar discrepancias de max_users
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  sp.name as plan_name,
  sp.max_users AS plan_max_users,
  tf.quota_limit AS feature_max_users,
  CASE 
    WHEN tf.quota_limit IS NULL THEN '[WARN] ? Feature nao criada'
    WHEN sp.max_users IS NULL AND tf.quota_limit IS NOT NULL THEN '[WARN] ? Plan ilimitado mas feature tem limite'
    WHEN sp.max_users IS NOT NULL AND tf.quota_limit IS NULL THEN '[WARN] ? Plan tem limite mas feature e ilimitada'
    WHEN sp.max_users != tf.quota_limit THEN '[ERROR]  Divergencia detectada'
    ELSE '[OK]  OK'
  END as status,
  CASE
    WHEN tf.quota_limit IS NULL THEN 'Criar feature: SELECT public.ensure_tenant_features(''' || t.id || '''::uuid, ''' || sp.name || ''', ' || COALESCE(sp.max_devices::text, '1') || ');'
    WHEN sp.max_users IS DISTINCT FROM tf.quota_limit THEN 'Corrigir: SELECT public.ensure_tenant_features(''' || t.id || '''::uuid, ''' || sp.name || ''', ' || COALESCE(sp.max_devices::text, '1') || ');'
    ELSE NULL
  END as fix_command
FROM public.tenants t
JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
JOIN public.subscription_plans sp ON sp.id = ts.plan_id
LEFT JOIN public.tenant_features tf ON tf.tenant_id = t.id AND tf.feature_key = 'max_users'
WHERE sp.max_users IS DISTINCT FROM tf.quota_limit
   OR tf.quota_limit IS NULL
ORDER BY t.created_at DESC;

-- Resumo de divergencias
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '[OK]  NENHUMA DIVERGENCIA'
    ELSE '[WARN] ? ' || COUNT(*) || ' DIVERGENCIAS ENCONTRADAS'
  END as resultado
FROM public.tenants t
JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
JOIN public.subscription_plans sp ON sp.id = ts.plan_id
LEFT JOIN public.tenant_features tf ON tf.tenant_id = t.id AND tf.feature_key = 'max_users'
WHERE sp.max_users IS DISTINCT FROM tf.quota_limit
   OR tf.quota_limit IS NULL;
