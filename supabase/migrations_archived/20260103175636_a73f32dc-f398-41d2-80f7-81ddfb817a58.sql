-- Ajustar handle_new_user para nao criar tenant/role quando usuario e provisionado por admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_tenant_id uuid;
  tenant_slug text;
  has_pending_invite boolean;
  v_is_admin_provisioned boolean;
  v_username text;
  v_full_name text;
BEGIN
  -- Detectar se foi provisionado por admin (created_by = 'admin' ou email @local.internal)
  v_is_admin_provisioned := (
    NEW.raw_user_meta_data->>'created_by' = 'admin'
    OR NEW.email LIKE '%@local.internal'
  );
  
  -- Extrair username e full_name do metadata
  v_username := NEW.raw_user_meta_data->>'username';
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    v_username
  );
  
  -- Criar/atualizar profile (sempre - idempotente)
  INSERT INTO public.profiles (user_id, full_name, username, updated_at)
  VALUES (NEW.id, v_full_name, v_username, now())
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    username = COALESCE(EXCLUDED.username, profiles.username),
    updated_at = now();
  
  -- Se foi provisionado por admin, parar aqui (nao criar tenant/role)
  -- O admin-create-user vai criar o user_role no tenant correto
  IF v_is_admin_provisioned THEN
    RAISE NOTICE 'User % provisioned by admin - skipping auto tenant/role creation', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Check for pending invite (fluxo normal de convites)
  SELECT EXISTS (
    SELECT 1 FROM public.invites 
    WHERE email = NEW.email 
    AND status = 'pending' 
    AND expires_at > now()
  ) INTO has_pending_invite;
  
  -- If has pending invite, don't create own tenant
  IF has_pending_invite THEN
    RETURN NEW;
  END IF;
  
  -- Create tenant for new user (auto-registro sem convite)
  tenant_slug := lower(replace(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), ' ', '-')) || '-' || substring(NEW.id::text from 1 for 8);
  
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    tenant_slug,
    NEW.id
  )
  RETURNING id INTO new_tenant_id;
  
  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'admin', new_tenant_id);
  
  -- Update tenant_subscriptions with trial_end
  UPDATE public.tenant_subscriptions
  SET 
    trial_end = now() + interval '30 days',
    status = 'trialing'
  WHERE tenant_id = new_tenant_id;
  
  -- CRITICAL FIX: Configure tenant features for free plan with 1 device
  PERFORM public.ensure_tenant_features(new_tenant_id, 'free', 1);
  
  RETURN NEW;
END;
$function$;