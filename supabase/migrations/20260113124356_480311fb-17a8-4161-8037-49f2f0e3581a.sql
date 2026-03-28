
-- ============================================================
-- PLANO DE CORRECAO FINAL - FASES RESTANTES (CORRIGIDO)
-- ============================================================

-- FASE 1: Adicionar indice composto para jobs(agent_id, created_at) se nao existir
CREATE INDEX IF NOT EXISTS idx_jobs_agent_id_created 
ON public.jobs (agent_id, created_at DESC);

-- FASE 3: Criar tenant_settings para os 5 tenants sem configuracao
-- Usando colunas corretas da tabela
INSERT INTO public.tenant_settings (
  tenant_id,
  alert_email,
  alert_threshold_virus_positive,
  alert_threshold_failed_jobs,
  alert_threshold_offline_agents,
  virustotal_enabled,
  stripe_enabled,
  enable_email_alerts,
  enable_webhook_alerts,
  enable_auto_quarantine,
  dns_local_filter_enabled,
  enable_dry_run_mode
)
SELECT 
  t.id,
  NULL, -- alert_email (sera configurado pelo tenant)
  5,    -- alert_threshold_virus_positive
  10,   -- alert_threshold_failed_jobs  
  3,    -- alert_threshold_offline_agents
  false,-- virustotal_enabled
  false,-- stripe_enabled
  false,-- enable_email_alerts (desativado por padrao)
  false,-- enable_webhook_alerts
  false,-- enable_auto_quarantine
  false,-- dns_local_filter_enabled
  false -- enable_dry_run_mode
FROM public.tenants t
LEFT JOIN public.tenant_settings ts ON ts.tenant_id = t.id
WHERE ts.id IS NULL
ON CONFLICT (tenant_id) DO NOTHING;

-- FASE 3.2: Criar trigger para auto-criar tenant_settings quando um novo tenant e criado
CREATE OR REPLACE FUNCTION public.auto_create_tenant_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.tenant_settings (
    tenant_id,
    alert_threshold_virus_positive,
    alert_threshold_failed_jobs,
    alert_threshold_offline_agents,
    virustotal_enabled,
    stripe_enabled,
    enable_email_alerts,
    enable_webhook_alerts,
    enable_auto_quarantine,
    dns_local_filter_enabled,
    enable_dry_run_mode
  )
  VALUES (
    NEW.id,
    5,    -- alert_threshold_virus_positive
    10,   -- alert_threshold_failed_jobs  
    3,    -- alert_threshold_offline_agents
    false,-- virustotal_enabled
    false,-- stripe_enabled
    false,-- enable_email_alerts
    false,-- enable_webhook_alerts
    false,-- enable_auto_quarantine
    false,-- dns_local_filter_enabled
    false -- enable_dry_run_mode
  )
  ON CONFLICT (tenant_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger apenas se nao existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trg_auto_create_tenant_settings' 
    AND tgrelid = 'public.tenants'::regclass
  ) THEN
    CREATE TRIGGER trg_auto_create_tenant_settings
    AFTER INSERT ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_create_tenant_settings();
  END IF;
END;
$$;

-- FASE 6: Criar tabela de auditoria para falhas de token (para debugging)
CREATE TABLE IF NOT EXISTS public.token_validation_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash_prefix TEXT NOT NULL,
  failure_reason TEXT NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice para limpeza automatica
CREATE INDEX IF NOT EXISTS idx_token_failures_created_at 
ON public.token_validation_failures (created_at);

-- RLS para token_validation_failures (apenas service_role pode inserir)
ALTER TABLE public.token_validation_failures ENABLE ROW LEVEL SECURITY;

-- Politica para service_role (backend apenas)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'token_validation_failures' 
    AND policyname = 'Service role can manage token failures'
  ) THEN
    CREATE POLICY "Service role can manage token failures"
    ON public.token_validation_failures
    FOR ALL
    USING (true)
    WITH CHECK (true);
  END IF;
END;
$$;

-- FASE 1.2: Criar funcao helper para queries longas
CREATE OR REPLACE FUNCTION public.execute_with_timeout(
  p_sql TEXT,
  p_timeout_ms INTEGER DEFAULT 30000
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_old_timeout TEXT;
BEGIN
  SELECT current_setting('statement_timeout') INTO v_old_timeout;
  EXECUTE format('SET LOCAL statement_timeout = %L', p_timeout_ms || 'ms');
  EXECUTE p_sql INTO v_result;
  EXECUTE format('SET LOCAL statement_timeout = %L', v_old_timeout);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  EXECUTE format('SET LOCAL statement_timeout = %L', v_old_timeout);
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentarios de documentacao
COMMENT ON TABLE public.token_validation_failures IS 
'Auditoria de falhas de validacao de tokens para debugging de 400/401 errors';

COMMENT ON FUNCTION public.auto_create_tenant_settings() IS 
'Cria automaticamente tenant_settings com valores default quando um novo tenant e criado';
