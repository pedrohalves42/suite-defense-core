-- FASE 3: Correções no Banco de Dados

-- 1. Trigger para atualizar used_by_agent automaticamente
CREATE OR REPLACE FUNCTION public.update_enrollment_key_usage()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Encontrar a enrollment key usada por este agente e marcar como usada
  UPDATE public.enrollment_keys
  SET 
    used_by_agent = NEW.agent_name,
    used_at = COALESCE(used_at, NOW()),
    current_uses = current_uses + 1
  WHERE id IN (
    SELECT ek.id 
    FROM public.enrollment_keys ek
    WHERE ek.tenant_id = NEW.tenant_id
      AND ek.is_active = true
      AND ek.used_by_agent IS NULL
      AND ek.expires_at > NOW()
    ORDER BY ek.created_at DESC
    LIMIT 1
  );
  
  RETURN NEW;
END;
$$;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trg_update_enrollment_usage ON public.agents;
CREATE TRIGGER trg_update_enrollment_usage
AFTER INSERT ON public.agents
FOR EACH ROW
EXECUTE FUNCTION public.update_enrollment_key_usage();

-- 2. Limpar agentes órfãos antigos (nunca conectaram)
DELETE FROM public.agents
WHERE status = 'pending'
  AND last_heartbeat IS NULL
  AND enrolled_at < NOW() - INTERVAL '48 hours';

-- 3. Adicionar índices para melhorar performance de queries comuns
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat ON public.agents(last_heartbeat DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_agents_tenant_status ON public.agents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_active ON public.enrollment_keys(tenant_id, is_active, expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_tokens_active ON public.agent_tokens(agent_id, is_active) WHERE is_active = true;

-- 4. Criar view materializada para métricas de instalação (otimização)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.installation_metrics_hourly AS
SELECT 
  date_trunc('hour', created_at) as hour,
  tenant_id,
  platform,
  event_type,
  COUNT(*) as event_count,
  AVG(installation_time_seconds) as avg_install_time,
  COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as error_count
FROM public.installation_analytics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY date_trunc('hour', created_at), tenant_id, platform, event_type;

CREATE UNIQUE INDEX IF NOT EXISTS idx_installation_metrics_hourly 
ON public.installation_metrics_hourly(hour, tenant_id, platform, event_type);

-- 5. Job para refresh automático da view materializada (usar com pg_cron se disponível)
COMMENT ON MATERIALIZED VIEW public.installation_metrics_hourly IS 
'Refreshed hourly. Manual refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY public.installation_metrics_hourly;';

-- Log da migração
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: Fixed enrollment keys, created triggers, added indexes, created metrics view';
END;
$$;