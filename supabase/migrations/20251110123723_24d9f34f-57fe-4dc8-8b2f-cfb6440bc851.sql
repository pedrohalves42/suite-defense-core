-- Função para incrementar/decrementar quota
CREATE OR REPLACE FUNCTION public.update_quota_usage(
  p_tenant_id uuid,
  p_feature_key text,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Atualizar ou criar feature com quota
  INSERT INTO public.tenant_features (tenant_id, feature_key, enabled, quota_used, quota_limit)
  VALUES (p_tenant_id, p_feature_key, true, GREATEST(0, p_delta), NULL)
  ON CONFLICT (tenant_id, feature_key) 
  DO UPDATE SET 
    quota_used = GREATEST(0, tenant_features.quota_used + p_delta),
    updated_at = now();
END;
$$;

-- Trigger para contar agentes ao criar
CREATE OR REPLACE FUNCTION public.increment_agent_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Incrementar quota de agentes
  PERFORM public.update_quota_usage(NEW.tenant_id, 'max_agents', 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_increment_agent_quota ON public.agents;
CREATE TRIGGER trigger_increment_agent_quota
  AFTER INSERT ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_agent_quota();

-- Trigger para decrementar ao deletar agente
CREATE OR REPLACE FUNCTION public.decrement_agent_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Decrementar quota de agentes
  PERFORM public.update_quota_usage(OLD.tenant_id, 'max_agents', -1);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_decrement_agent_quota ON public.agents;
CREATE TRIGGER trigger_decrement_agent_quota
  AFTER DELETE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_agent_quota();

-- Trigger para contar virus scans
CREATE OR REPLACE FUNCTION public.increment_scan_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Incrementar quota de scans
  PERFORM public.update_quota_usage(NEW.tenant_id, 'max_scans_per_month', 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_increment_scan_quota ON public.virus_scans;
CREATE TRIGGER trigger_increment_scan_quota
  AFTER INSERT ON public.virus_scans
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_scan_quota();

-- Trigger para contar usuários ao criar
CREATE OR REPLACE FUNCTION public.increment_user_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Incrementar quota de usuários
  PERFORM public.update_quota_usage(NEW.tenant_id, 'max_users', 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_increment_user_quota ON public.user_roles;
CREATE TRIGGER trigger_increment_user_quota
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_user_quota();

-- Trigger para decrementar ao deletar usuário
CREATE OR REPLACE FUNCTION public.decrement_user_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Decrementar quota de usuários
  PERFORM public.update_quota_usage(OLD.tenant_id, 'max_users', -1);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_decrement_user_quota ON public.user_roles;
CREATE TRIGGER trigger_decrement_user_quota
  AFTER DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_user_quota();

-- Atualizar quotas atuais baseado nos dados existentes
DO $$
DECLARE
  tenant_record RECORD;
  agent_count INTEGER;
  user_count INTEGER;
BEGIN
  FOR tenant_record IN SELECT id FROM public.tenants LOOP
    -- Contar agentes
    SELECT COUNT(*) INTO agent_count
    FROM public.agents
    WHERE tenant_id = tenant_record.id;
    
    -- Atualizar quota de agentes
    UPDATE public.tenant_features
    SET quota_used = agent_count
    WHERE tenant_id = tenant_record.id AND feature_key = 'max_agents';
    
    -- Contar usuários
    SELECT COUNT(*) INTO user_count
    FROM public.user_roles
    WHERE tenant_id = tenant_record.id;
    
    -- Atualizar quota de usuários
    UPDATE public.tenant_features
    SET quota_used = user_count
    WHERE tenant_id = tenant_record.id AND feature_key = 'max_users';
  END LOOP;
END $$;