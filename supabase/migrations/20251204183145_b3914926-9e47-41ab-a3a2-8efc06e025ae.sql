-- Fase 1: Configurar max_agents = 20 para Genial Cred
UPDATE tenant_features 
SET quota_limit = 20 
WHERE tenant_id = '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e' 
  AND feature_key = 'max_agents';

-- Se nao existir, criar a feature
INSERT INTO tenant_features (tenant_id, feature_key, quota_limit, enabled)
SELECT '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'max_agents', 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_features 
  WHERE tenant_id = '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e' 
    AND feature_key = 'max_agents'
);

-- Fase 2: Habilitar features Pro para Genial Cred
INSERT INTO tenant_features (tenant_id, feature_key, enabled, quota_limit)
VALUES 
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'priority_support', true, NULL),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'custom_reports', true, NULL),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'api_access', true, NULL),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'analytics_dashboard', true, NULL)
ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = true;

-- Fase 3: Criar convite para tatypm@hotmail.com como admin do Genial Cred
INSERT INTO invites (email, role, tenant_id, invited_by, expires_at, status, token)
SELECT 
  'tatypm@hotmail.com',
  'admin',
  '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e',
  '3e84844f-4be2-4a7a-b2e0-811d5975874f',
  NOW() + INTERVAL '7 days',
  'pending',
  gen_random_uuid()
WHERE NOT EXISTS (
  SELECT 1 FROM invites 
  WHERE email = 'tatypm@hotmail.com' 
    AND tenant_id = '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e'
    AND status = 'pending'
);