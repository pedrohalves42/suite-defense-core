-- Update handle_new_user to set trial_end for new tenants
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_tenant_id uuid;
  tenant_slug text;
  has_pending_invite boolean;
BEGIN
  -- Inserir profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- Verificar se existe convite pendente para este email
  SELECT EXISTS (
    SELECT 1 FROM public.invites 
    WHERE email = NEW.email 
    AND status = 'pending' 
    AND expires_at > now()
  ) INTO has_pending_invite;
  
  -- Se tem convite pendente, não criar tenant próprio
  IF has_pending_invite THEN
    RETURN NEW;
  END IF;
  
  -- Criar tenant para novo usuário
  tenant_slug := lower(replace(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), ' ', '-')) || '-' || substring(NEW.id::text from 1 for 8);
  
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    tenant_slug,
    NEW.id
  )
  RETURNING id INTO new_tenant_id;
  
  -- Atribuir role admin
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'admin', new_tenant_id);
  
  -- Atualizar tenant_subscriptions com trial_end de 30 dias
  UPDATE public.tenant_subscriptions
  SET 
    trial_end = now() + interval '30 days',
    status = 'trialing'
  WHERE tenant_id = new_tenant_id;
  
  RETURN NEW;
END;
$$;