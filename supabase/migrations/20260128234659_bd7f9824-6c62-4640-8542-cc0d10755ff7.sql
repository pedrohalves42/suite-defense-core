-- =====================================================================
-- MIGRATION: Correcao Definitiva do Signup (handle_new_user)
-- ADR-024: Elimina erro 500 causado por schema drift
-- =====================================================================

-- ===========================================
-- PARTE A: PRE-CHECK (Fail Fast)
-- ===========================================
DO $$
DECLARE
  _has_slug BOOLEAN;
  _has_owner_user_id BOOLEAN;
  _has_trial_end BOOLEAN;
  _has_current_period_end BOOLEAN;
  _has_admin_role BOOLEAN;
  _has_free_plan BOOLEAN;
  _has_ensure_features BOOLEAN;
BEGIN
  -- Verificar coluna slug em tenants
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'slug'
  ) INTO _has_slug;
  
  IF NOT _has_slug THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: coluna "slug" nao existe em public.tenants';
  END IF;

  -- Verificar coluna owner_user_id em tenants
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'owner_user_id'
  ) INTO _has_owner_user_id;
  
  IF NOT _has_owner_user_id THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: coluna "owner_user_id" nao existe em public.tenants';
  END IF;

  -- Verificar coluna trial_end em tenant_subscriptions
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'trial_end'
  ) INTO _has_trial_end;
  
  IF NOT _has_trial_end THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: coluna "trial_end" nao existe em public.tenant_subscriptions';
  END IF;

  -- Verificar coluna current_period_end em tenant_subscriptions
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenant_subscriptions' AND column_name = 'current_period_end'
  ) INTO _has_current_period_end;
  
  IF NOT _has_current_period_end THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: coluna "current_period_end" nao existe em public.tenant_subscriptions';
  END IF;

  -- Verificar enum app_role contem 'admin'
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'admin'
  ) INTO _has_admin_role;
  
  IF NOT _has_admin_role THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: enum app_role nao contem valor "admin"';
  END IF;

  -- Verificar plano 'free' existe
  SELECT EXISTS (
    SELECT 1 FROM public.subscription_plans WHERE name = 'free'
  ) INTO _has_free_plan;
  
  IF NOT _has_free_plan THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: plano "free" nao existe em subscription_plans';
  END IF;

  -- Verificar funcao ensure_tenant_features(uuid, text, integer) existe
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname = 'ensure_tenant_features'
      AND pg_get_function_arguments(p.oid) LIKE '%uuid%text%integer%'
  ) INTO _has_ensure_features;
  
  IF NOT _has_ensure_features THEN
    RAISE EXCEPTION 'PRE-CHECK FAILED: funcao ensure_tenant_features(uuid, text, integer) nao existe';
  END IF;

  RAISE NOTICE 'PRE-CHECK PASSED: Todos os requisitos de schema validados';
END $$;

-- ===========================================
-- PARTE B: HANDLE_NEW_USER (Versao Correta)
-- ===========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  full_name TEXT;
  user_email TEXT;
  tenant_slug TEXT;
  new_tenant_id UUID;
  free_plan_id UUID;
  device_qty INTEGER := 1;
  device_count_str TEXT;
  has_pending_invite BOOLEAN := FALSE;
  admin_provisioned BOOLEAN := FALSE;
  trial_end_date TIMESTAMPTZ;
BEGIN
  -- Extrair dados do usuario
  full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  user_email := COALESCE(NEW.email, '');

  -- 1) UPSERT em profiles (idempotente)
  INSERT INTO public.profiles (user_id, full_name, username, updated_at)
  VALUES (NEW.id, full_name, NULL, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    updated_at = NOW();

  -- 2) Verificar se foi provisionado por admin
  admin_provisioned := COALESCE((NEW.raw_user_meta_data->>'admin_provisioned')::BOOLEAN, FALSE);
  IF admin_provisioned THEN
    RETURN NEW;
  END IF;

  -- 3) Verificar convite pendente
  SELECT EXISTS (
    SELECT 1 FROM public.invites 
    WHERE email = user_email 
      AND status = 'pending'
  ) INTO has_pending_invite;
  
  IF has_pending_invite THEN
    RETURN NEW;
  END IF;

  -- 4) Gerar slug unico para tenant
  tenant_slug := lower(regexp_replace(
    COALESCE(full_name, split_part(user_email, '@', 1)),
    '[^a-zA-Z0-9]+', '-', 'g'
  )) || '-' || substring(NEW.id::text FROM 1 FOR 8);

  -- 5) Criar tenant com schema correto
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    COALESCE(full_name, 'Minha Empresa'),
    tenant_slug,
    NEW.id
  )
  RETURNING id INTO new_tenant_id;

  -- 6) Criar role 'admin' para o usuario no tenant
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'admin', new_tenant_id);

  -- 7) Mapear device_count para device_qty
  device_count_str := NEW.raw_user_meta_data->>'device_count';
  device_qty := CASE device_count_str
    WHEN '1-3' THEN 3
    WHEN '4-10' THEN 10
    WHEN '11-30' THEN 30
    WHEN '31-100' THEN 100
    WHEN '100+' THEN 100
    ELSE 1
  END;

  -- 8) Buscar plano 'free'
  SELECT id INTO free_plan_id
  FROM public.subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  IF free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plano "free" nao encontrado em subscription_plans';
  END IF;

  -- 9) Calcular data de trial (14 dias)
  trial_end_date := NOW() + INTERVAL '14 days';

  -- 10) UPSERT em tenant_subscriptions (idempotente com create_default_subscription)
  INSERT INTO public.tenant_subscriptions (
    tenant_id,
    plan_id,
    status,
    trial_end,
    current_period_end,
    device_quantity,
    created_at,
    updated_at
  )
  VALUES (
    new_tenant_id,
    free_plan_id,
    'trialing',
    trial_end_date,
    trial_end_date,
    device_qty,
    NOW(),
    NOW()
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    status = 'trialing',
    trial_end = trial_end_date,
    current_period_end = trial_end_date,
    device_quantity = device_qty,
    updated_at = NOW();

  -- 11) Provisionar features do plano free
  PERFORM public.ensure_tenant_features(new_tenant_id, 'free', device_qty);

  RETURN NEW;
END;
$$;

-- Comentario para auditoria
COMMENT ON FUNCTION public.handle_new_user() IS 
'ADR-024: Trigger de onboarding corrigido. Usa schema correto (slug, owner_user_id, admin role). 
UPSERT em tenant_subscriptions para idempotencia com create_default_subscription. 
Trial de 14 dias automatico. Respeita admin_provisioned e pending_invite.';

-- ===========================================
-- PARTE C: CREATE_DEFAULT_SUBSCRIPTION (Hardened)
-- ===========================================
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  free_plan_id UUID;
BEGIN
  -- Buscar plano free
  SELECT id INTO free_plan_id
  FROM public.subscription_plans
  WHERE name = 'free'
  LIMIT 1;

  -- Se nao existe plano free, nao fazer nada (fail silently, handle_new_user cuidara)
  IF free_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- INSERT com ON CONFLICT DO NOTHING (dupla protecao)
  INSERT INTO public.tenant_subscriptions (tenant_id, plan_id)
  VALUES (NEW.id, free_plan_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Comentario para auditoria
COMMENT ON FUNCTION public.create_default_subscription() IS 
'ADR-024: Trigger hardened com ON CONFLICT DO NOTHING. 
Cria subscription basica; handle_new_user faz UPSERT para trial de 14 dias.';

-- ===========================================
-- PARTE D: Garantir triggers estao ativos
-- ===========================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS create_tenant_subscription ON public.tenants;
CREATE TRIGGER create_tenant_subscription
  AFTER INSERT ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.create_default_subscription();