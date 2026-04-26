-- Atualizar funcao handle_new_user para criar tenant individual com admin apenas para usuarios nao convidados
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
  
  -- Se tem convite pendente, nao criar tenant proprio
  -- O tenant sera atribuido quando aceitar o convite
  IF has_pending_invite THEN
    RETURN NEW;
  END IF;
  
  -- Criar tenant para novo usuario (apenas se nao foi convidado)
  tenant_slug := lower(replace(COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), ' ', '-')) || '-' || substring(NEW.id::text from 1 for 8);
  
  INSERT INTO public.tenants (name, slug, owner_user_id)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    tenant_slug,
    NEW.id
  )
  RETURNING id INTO new_tenant_id;
  
  -- Todo novo usuario que cria conta diretamente (sem convite) e admin do seu proprio tenant
  INSERT INTO public.user_roles (user_id, role, tenant_id)
  VALUES (NEW.id, 'admin', new_tenant_id);
  
  RETURN NEW;
END;
$function$;