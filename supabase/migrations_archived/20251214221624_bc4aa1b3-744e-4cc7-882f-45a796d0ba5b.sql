-- FASE 1: Configurar Licenca Pro para Genialcred ate 31/01/2026
-- Primeiro, buscar o plan_id do plano Pro
DO $$
DECLARE
  v_pro_plan_id uuid;
  v_genialcred_tenant_id uuid := '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e';
BEGIN
  -- Buscar ID do plano Pro
  SELECT id INTO v_pro_plan_id FROM subscription_plans WHERE name = 'pro' LIMIT 1;
  
  -- Se nao encontrar, usar um default
  IF v_pro_plan_id IS NULL THEN
    SELECT id INTO v_pro_plan_id FROM subscription_plans WHERE name ILIKE '%pro%' LIMIT 1;
  END IF;

  -- Atualizar subscription para Genialcred
  UPDATE tenant_subscriptions 
  SET 
    plan_id = v_pro_plan_id,
    status = 'active',
    trial_end = '2026-01-31 23:59:59+00'::timestamptz,
    current_period_end = '2026-01-31 23:59:59+00'::timestamptz,
    device_quantity = 200
  WHERE tenant_id = v_genialcred_tenant_id;
  
  -- Se nao existir, criar
  IF NOT FOUND THEN
    INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, trial_end, current_period_end, device_quantity)
    VALUES (v_genialcred_tenant_id, v_pro_plan_id, 'active', '2026-01-31 23:59:59+00', '2026-01-31 23:59:59+00', 200);
  END IF;
END $$;

-- Configurar features Pro para Genialcred
INSERT INTO tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used)
VALUES 
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'max_devices', true, 200, 0),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'max_users', true, 50, 0),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'advanced_scans_daily', true, NULL, 0),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'priority_support', true, NULL, 0),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'analytics_dashboard', true, NULL, 0),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'api_access', true, NULL, 0),
  ('2584d2cd-8b99-4ca7-a8e2-b61256e82b3e', 'custom_reports', true, NULL, 0)
ON CONFLICT (tenant_id, feature_key) 
DO UPDATE SET 
  enabled = true,
  quota_limit = EXCLUDED.quota_limit;

-- FASE 2: Limpar dados antigos de installation_analytics para reset
DELETE FROM installation_analytics WHERE created_at < NOW() - INTERVAL '30 days';

-- Limpar jobs antigos com timeout
DELETE FROM jobs WHERE status = 'failed' AND error_message LIKE '%timeout%' AND created_at < NOW() - INTERVAL '7 days';

-- Adicionar coluna display_name aos agentes se nao existir
ALTER TABLE agents ADD COLUMN IF NOT EXISTS display_name text;

-- Atualizar display_name com hostname ou agent_name mais amigavel
UPDATE agents 
SET display_name = COALESCE(
  NULLIF(hostname, ''),
  REPLACE(REPLACE(agent_name, 'cybershield-', ''), '-agent', '')
)
WHERE display_name IS NULL;