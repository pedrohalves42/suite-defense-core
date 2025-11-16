-- ============================================================================
-- P1.4: Query de Diagnóstico de Consistência de Limites
-- Verifica discrepâncias entre subscription_plans e tenant_features
-- ============================================================================

-- Buscar discrepâncias de max_users
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  sp.name as plan_name,
  sp.max_users AS plan_max_users,
  tf.quota_limit AS feature_max_users,
  CASE 
    WHEN tf.quota_limit IS NULL THEN '⚠️ Feature não criada'
    WHEN sp.max_users IS NULL AND tf.quota_limit IS NOT NULL THEN '⚠️ Plan ilimitado mas feature tem limite'
    WHEN sp.max_users IS NOT NULL AND tf.quota_limit IS NULL THEN '⚠️ Plan tem limite mas feature é ilimitada'
    WHEN sp.max_users != tf.quota_limit THEN '❌ Divergência detectada'
    ELSE '✅ OK'
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

-- Resumo de divergências
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ NENHUMA DIVERGÊNCIA'
    ELSE '⚠️ ' || COUNT(*) || ' DIVERGÊNCIAS ENCONTRADAS'
  END as resultado
FROM public.tenants t
JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
JOIN public.subscription_plans sp ON sp.id = ts.plan_id
LEFT JOIN public.tenant_features tf ON tf.tenant_id = t.id AND tf.feature_key = 'max_users'
WHERE sp.max_users IS DISTINCT FROM tf.quota_limit
   OR tf.quota_limit IS NULL;
