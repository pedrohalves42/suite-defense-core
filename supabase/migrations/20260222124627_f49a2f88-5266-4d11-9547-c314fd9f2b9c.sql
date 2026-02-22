
-- Tabela de configurações de webhook para destinos de notificação
CREATE TABLE public.webhook_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  headers JSONB DEFAULT '{}'::jsonb,
  event_types TEXT[] DEFAULT ARRAY['security_alert', 'critical_alert', 'dlq_exhausted'],
  severity_filter TEXT[] DEFAULT ARRAY['critical', 'warning'],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status_code INTEGER,
  failure_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.webhook_configs IS 'Configurações de destinos de webhook para notificações externas';
COMMENT ON COLUMN public.webhook_configs.url IS 'URL de destino para envio de alertas via POST';
COMMENT ON COLUMN public.webhook_configs.secret IS 'Chave HMAC para assinatura de payloads (X-Webhook-Signature)';
COMMENT ON COLUMN public.webhook_configs.event_types IS 'Tipos de eventos que disparam o webhook';
COMMENT ON COLUMN public.webhook_configs.severity_filter IS 'Filtro de severidade mínima para disparo';
COMMENT ON COLUMN public.webhook_configs.failure_count IS 'Contador de falhas consecutivas para circuit breaker';

ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants podem ver seus webhooks"
  ON public.webhook_configs FOR SELECT
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Admins podem gerenciar webhooks"
  ON public.webhook_configs FOR ALL
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')));

CREATE POLICY "Service role acesso total webhook_configs"
  ON public.webhook_configs FOR ALL
  USING (auth.role() = 'service_role');

CREATE TRIGGER update_webhook_configs_updated_at
  BEFORE UPDATE ON public.webhook_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela para rastrear alertas de DLQ exaurida
CREATE TABLE public.dlq_exhaustion_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  dlq_item_id UUID NOT NULL,
  job_id UUID,
  agent_id UUID,
  failure_class TEXT NOT NULL,
  total_retries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  alert_sent BOOLEAN NOT NULL DEFAULT false,
  alert_sent_at TIMESTAMPTZ,
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dlq_exhaustion_alerts IS 'Alertas gerados quando jobs falham definitivamente após todos os retries';
COMMENT ON COLUMN public.dlq_exhaustion_alerts.failure_class IS 'Classe de falha do job (TIMEOUT, BUG, AGENT_OFFLINE, etc)';

ALTER TABLE public.dlq_exhaustion_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants podem ver alertas DLQ"
  ON public.dlq_exhaustion_alerts FOR SELECT
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "Admins podem gerenciar alertas DLQ"
  ON public.dlq_exhaustion_alerts FOR UPDATE
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')));

CREATE POLICY "Service role acesso total dlq_exhaustion_alerts"
  ON public.dlq_exhaustion_alerts FOR ALL
  USING (auth.role() = 'service_role');
