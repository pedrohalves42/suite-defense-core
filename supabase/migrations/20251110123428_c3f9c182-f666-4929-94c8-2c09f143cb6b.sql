-- Criar campos de quota na tabela tenant_features se não existirem
ALTER TABLE public.tenant_features 
ADD COLUMN IF NOT EXISTS quota_warning_threshold integer DEFAULT 80;

-- Função para verificar quota e enviar alertas
CREATE OR REPLACE FUNCTION public.check_quota_threshold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  usage_percentage numeric;
  tenant_name text;
BEGIN
  -- Calcular porcentagem de uso
  IF NEW.quota_limit IS NOT NULL AND NEW.quota_limit > 0 THEN
    usage_percentage := (NEW.quota_used::numeric / NEW.quota_limit::numeric) * 100;
    
    -- Se atingiu o threshold, enviar alerta
    IF usage_percentage >= COALESCE(NEW.quota_warning_threshold, 80) THEN
      -- Buscar nome do tenant
      SELECT name INTO tenant_name FROM tenants WHERE id = NEW.tenant_id;
      
      -- Log para monitoramento
      RAISE NOTICE 'Quota threshold exceeded: % for tenant % (% of %)', 
        NEW.feature_key, tenant_name, NEW.quota_used, NEW.quota_limit;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger para verificar quota
DROP TRIGGER IF EXISTS trigger_check_quota_threshold ON public.tenant_features;
CREATE TRIGGER trigger_check_quota_threshold
  AFTER UPDATE OF quota_used ON public.tenant_features
  FOR EACH ROW
  WHEN (NEW.quota_limit IS NOT NULL AND NEW.quota_limit > 0)
  EXECUTE FUNCTION public.check_quota_threshold();

-- Inserir features padrão de quota para tenants existentes
INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used, quota_warning_threshold)
SELECT 
  t.id,
  'max_agents',
  true,
  10,
  0,
  80
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_features tf 
  WHERE tf.tenant_id = t.id AND tf.feature_key = 'max_agents'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used, quota_warning_threshold)
SELECT 
  t.id,
  'max_scans_per_month',
  true,
  1000,
  0,
  80
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_features tf 
  WHERE tf.tenant_id = t.id AND tf.feature_key = 'max_scans_per_month'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_limit, quota_used, quota_warning_threshold)
SELECT 
  t.id,
  'max_users',
  true,
  20,
  0,
  80
FROM public.tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_features tf 
  WHERE tf.tenant_id = t.id AND tf.feature_key = 'max_users'
)
ON CONFLICT DO NOTHING;

-- Função para resetar contador de scans mensalmente
CREATE OR REPLACE FUNCTION public.reset_monthly_scan_quota()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tenant_features
  SET quota_used = 0
  WHERE feature_key = 'max_scans_per_month';
  
  RAISE NOTICE 'Monthly scan quotas reset at %', now();
END;
$$;