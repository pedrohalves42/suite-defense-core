
-- ============================================
-- MODELO DE SUSPENSAO AUTOMATICA DE TENANTS
-- ============================================

-- 1. Adicionar campos de suspensao na tabela tenants
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS suspension_status TEXT NOT NULL DEFAULT 'active' 
    CHECK (suspension_status IN ('active', 'warned', 'suspended', 'pending_deletion')),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_warning_sent_at TIMESTAMPTZ;

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_tenants_suspension_status ON public.tenants (suspension_status);
CREATE INDEX IF NOT EXISTS idx_tenants_last_activity ON public.tenants (last_activity_at) WHERE suspension_status = 'active';

-- 2. Tabela de log de eventos de suspensao (auditoria)
CREATE TABLE IF NOT EXISTS public.tenant_suspension_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('warning_sent', 'suspended', 'reactivated', 'cleanup_started', 'cleanup_completed', 'deletion_scheduled', 'deleted')),
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  performed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_suspension_events ENABLE ROW LEVEL SECURITY;

-- Only super_admins can view suspension events
CREATE POLICY "Super admins can view suspension events"
  ON public.tenant_suspension_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- 3. Tabela de configuracao de suspensao
CREATE TABLE IF NOT EXISTS public.tenant_suspension_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warning_days INTEGER NOT NULL DEFAULT 45,
  suspension_days INTEGER NOT NULL DEFAULT 60,
  deletion_days INTEGER NOT NULL DEFAULT 90,
  cleanup_batch_size INTEGER NOT NULL DEFAULT 100,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  exempt_tenant_ids UUID[] DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.tenant_suspension_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage suspension config"
  ON public.tenant_suspension_config
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Insert default config
INSERT INTO public.tenant_suspension_config (warning_days, suspension_days, deletion_days)
VALUES (45, 60, 90)
ON CONFLICT DO NOTHING;

-- 4. Funcao para atualizar last_activity_at automaticamente
CREATE OR REPLACE FUNCTION public.update_tenant_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Extract tenant_id from the row
  IF TG_TABLE_NAME = 'agents' THEN
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'system_alerts' THEN
    v_tenant_id := NEW.tenant_id;
  ELSIF TG_TABLE_NAME = 'scheduled_jobs' THEN
    v_tenant_id := NEW.tenant_id;
  ELSE
    v_tenant_id := NEW.tenant_id;
  END IF;

  IF v_tenant_id IS NOT NULL THEN
    UPDATE public.tenants 
    SET last_activity_at = now()
    WHERE id = v_tenant_id 
      AND (last_activity_at IS NULL OR last_activity_at < now() - INTERVAL '1 hour');
  END IF;

  RETURN NEW;
END;
$$;

-- Attach triggers to key activity tables
CREATE TRIGGER tr_update_tenant_activity_agents
  AFTER INSERT OR UPDATE ON public.agents
  FOR EACH ROW EXECUTE FUNCTION public.update_tenant_activity();

CREATE TRIGGER tr_update_tenant_activity_alerts
  AFTER INSERT ON public.system_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_tenant_activity();

-- 5. RPC para processar suspensao automatica (chamada pelo cron)
CREATE OR REPLACE FUNCTION public.process_tenant_suspensions()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_warned INTEGER := 0;
  v_suspended INTEGER := 0;
  v_scheduled INTEGER := 0;
  v_tenant RECORD;
BEGIN
  -- Only service_role can call this
  IF NOT (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: requires service_role';
  END IF;

  -- Get config
  SELECT * INTO v_config FROM public.tenant_suspension_config WHERE is_enabled = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'disabled', 'message', 'Suspension system is disabled');
  END IF;

  -- PHASE 1: Send warnings (active tenants inactive for warning_days)
  FOR v_tenant IN
    SELECT id, name, last_activity_at 
    FROM public.tenants
    WHERE suspension_status = 'active'
      AND last_activity_at < now() - (v_config.warning_days || ' days')::INTERVAL
      AND (suspension_warning_sent_at IS NULL OR suspension_warning_sent_at < now() - INTERVAL '7 days')
      AND NOT (id = ANY(v_config.exempt_tenant_ids))
    LIMIT v_config.cleanup_batch_size
  LOOP
    UPDATE public.tenants 
    SET suspension_status = 'warned',
        suspension_warning_sent_at = now()
    WHERE id = v_tenant.id;

    INSERT INTO public.tenant_suspension_events (tenant_id, event_type, previous_status, new_status, reason)
    VALUES (v_tenant.id, 'warning_sent', 'active', 'warned', 
            'Inativo por ' || v_config.warning_days || '+ dias. Ultima atividade: ' || v_tenant.last_activity_at);

    v_warned := v_warned + 1;
  END LOOP;

  -- PHASE 2: Suspend (warned tenants inactive for suspension_days)
  FOR v_tenant IN
    SELECT id, name, last_activity_at
    FROM public.tenants
    WHERE suspension_status = 'warned'
      AND last_activity_at < now() - (v_config.suspension_days || ' days')::INTERVAL
      AND NOT (id = ANY(v_config.exempt_tenant_ids))
    LIMIT v_config.cleanup_batch_size
  LOOP
    UPDATE public.tenants
    SET suspension_status = 'suspended',
        suspended_at = now(),
        suspension_reason = 'Inatividade automatica (' || v_config.suspension_days || ' dias)'
    WHERE id = v_tenant.id;

    INSERT INTO public.tenant_suspension_events (tenant_id, event_type, previous_status, new_status, reason)
    VALUES (v_tenant.id, 'suspended', 'warned', 'suspended',
            'Suspenso por inatividade de ' || v_config.suspension_days || '+ dias');

    v_suspended := v_suspended + 1;
  END LOOP;

  -- PHASE 3: Schedule deletion (suspended for deletion_days - suspension_days)
  FOR v_tenant IN
    SELECT id, name, suspended_at
    FROM public.tenants
    WHERE suspension_status = 'suspended'
      AND suspended_at < now() - ((v_config.deletion_days - v_config.suspension_days) || ' days')::INTERVAL
      AND NOT (id = ANY(v_config.exempt_tenant_ids))
    LIMIT v_config.cleanup_batch_size
  LOOP
    UPDATE public.tenants
    SET suspension_status = 'pending_deletion',
        deletion_scheduled_at = now() + INTERVAL '30 days'
    WHERE id = v_tenant.id;

    INSERT INTO public.tenant_suspension_events (tenant_id, event_type, previous_status, new_status, reason)
    VALUES (v_tenant.id, 'deletion_scheduled', 'suspended', 'pending_deletion',
            'Delecao agendada para ' || (now() + INTERVAL '30 days')::TEXT);

    v_scheduled := v_scheduled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'completed',
    'warned', v_warned,
    'suspended', v_suspended,
    'deletion_scheduled', v_scheduled,
    'processed_at', now()
  );
END;
$$;

-- Restrict access
REVOKE ALL ON FUNCTION public.process_tenant_suspensions() FROM public, anon;

-- 6. RPC para cleanup de dados de tenants suspensos
CREATE OR REPLACE FUNCTION public.cleanup_suspended_tenant_data(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_deleted JSONB := '{}'::JSONB;
  v_count INTEGER;
BEGIN
  -- Only service_role can call this
  IF NOT (current_setting('request.jwt.claim.role', true) = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: requires service_role';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF v_tenant.suspension_status NOT IN ('suspended', 'pending_deletion') THEN
    RAISE EXCEPTION 'Tenant is not suspended';
  END IF;

  -- Log cleanup start
  INSERT INTO public.tenant_suspension_events (tenant_id, event_type, reason)
  VALUES (p_tenant_id, 'cleanup_started', 'Limpeza de dados obsoletos iniciada');

  -- Clean non-critical data (keep audit logs for compliance)
  -- 1. Agent disk metrics (older than 7 days)
  DELETE FROM public.agent_disk_metrics WHERE tenant_id = p_tenant_id AND created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agent_disk_metrics', v_count);

  -- 2. Agent certificates
  DELETE FROM public.agent_certificates WHERE tenant_id = p_tenant_id AND collected_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agent_certificates', v_count);

  -- 3. File integrity records
  DELETE FROM public.agent_file_integrity WHERE tenant_id = p_tenant_id AND collected_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agent_file_integrity', v_count);

  -- 4. Old scheduled job runs
  DELETE FROM public.scheduled_job_runs WHERE tenant_id = p_tenant_id AND completed_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('scheduled_job_runs', v_count);

  -- 5. AI insights (non-acknowledged)
  DELETE FROM public.ai_insights WHERE tenant_id = p_tenant_id AND acknowledged = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('ai_insights', v_count);

  -- Log cleanup completion
  INSERT INTO public.tenant_suspension_events (tenant_id, event_type, reason, metadata)
  VALUES (p_tenant_id, 'cleanup_completed', 'Limpeza de dados concluida', v_deleted);

  RETURN jsonb_build_object(
    'status', 'completed',
    'tenant_id', p_tenant_id,
    'deleted', v_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_suspended_tenant_data(UUID) FROM public, anon;

-- 7. RPC para reativar tenant
CREATE OR REPLACE FUNCTION public.reactivate_tenant(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
BEGIN
  -- Verify caller is super_admin or service_role
  IF NOT (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found';
  END IF;

  IF v_tenant.suspension_status = 'active' THEN
    RETURN jsonb_build_object('status', 'already_active');
  END IF;

  UPDATE public.tenants
  SET suspension_status = 'active',
      suspended_at = NULL,
      suspension_reason = NULL,
      deletion_scheduled_at = NULL,
      suspension_warning_sent_at = NULL,
      last_activity_at = now()
  WHERE id = p_tenant_id;

  INSERT INTO public.tenant_suspension_events (tenant_id, event_type, previous_status, new_status, reason, performed_by)
  VALUES (p_tenant_id, 'reactivated', v_tenant.suspension_status, 'active', 'Reativado manualmente', auth.uid());

  RETURN jsonb_build_object('status', 'reactivated', 'tenant_id', p_tenant_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_tenant(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_tenant(UUID) TO authenticated;
