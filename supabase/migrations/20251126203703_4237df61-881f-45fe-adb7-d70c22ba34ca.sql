-- ================================================================
-- MIGRATION: Fix handle_new_user to configure tenant features
-- ================================================================

-- Drop existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate handle_new_user function with ensure_tenant_features call
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  new_tenant_id uuid;
  tenant_slug text;
  has_pending_invite boolean;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- Check for pending invite
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
  
  -- Create tenant for new user
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

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();