-- Corrigir trigger para auto-atribuir role admin ao primeiro usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  -- Inserir perfil
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  
  -- Contar usuários existentes
  SELECT COUNT(*) INTO user_count FROM auth.users;
  
  -- Se for o primeiro usuário, torná-lo admin
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    -- Usuários subsequentes recebem role viewer por padrão
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'viewer');
  END IF;
  
  RETURN NEW;
END;
$$;