-- Criar tabela de planos de assinatura
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  max_users integer NOT NULL,
  max_agents integer,
  max_scans_per_month integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Inserir planos padrão
INSERT INTO public.subscription_plans (name, max_users, max_agents, max_scans_per_month)
VALUES 
  ('free', 2, 5, 100),
  ('pro', 10, 50, 1000),
  ('enterprise', 999999, 999999, 999999)
ON CONFLICT (name) DO NOTHING;

-- Criar tabela de assinaturas dos tenants
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Inserir assinatura free para todos os tenants existentes
INSERT INTO public.tenant_subscriptions (tenant_id, plan_id)
SELECT t.id, p.id
FROM public.tenants t
CROSS JOIN public.subscription_plans p
WHERE p.name = 'free'
ON CONFLICT (tenant_id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies para subscription_plans
CREATE POLICY "Qualquer um pode ver planos"
ON public.subscription_plans
FOR SELECT
USING (true);

-- RLS Policies para tenant_subscriptions
CREATE POLICY "Admins podem ver assinatura do seu tenant"
ON public.tenant_subscriptions
FOR SELECT
USING (has_role(auth.uid(), 'admin') AND tenant_id = current_user_tenant_id());

CREATE POLICY "Admins podem gerenciar assinatura do seu tenant"
ON public.tenant_subscriptions
FOR ALL
USING (has_role(auth.uid(), 'admin') AND tenant_id = current_user_tenant_id())
WITH CHECK (has_role(auth.uid(), 'admin') AND tenant_id = current_user_tenant_id());

-- Trigger para criar assinatura free automaticamente para novos tenants
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  free_plan_id uuid;
BEGIN
  SELECT id INTO free_plan_id FROM public.subscription_plans WHERE name = 'free' LIMIT 1;
  
  INSERT INTO public.tenant_subscriptions (tenant_id, plan_id)
  VALUES (NEW.id, free_plan_id);
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER create_tenant_subscription
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.create_default_subscription();