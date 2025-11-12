-- CORREÇÃO FASE 2.1: Adicionar foreign key audit_logs.actor_id -> profiles.user_id
-- Isso resolve o erro 400 ao buscar audit_logs com join para profiles

-- Primeiro, adicionar a coluna actor_id se não existir
ALTER TABLE public.audit_logs 
ADD COLUMN IF NOT EXISTS actor_id uuid;

-- Criar o índice para performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id 
ON public.audit_logs(actor_id);

-- Adicionar a foreign key
ALTER TABLE public.audit_logs
ADD CONSTRAINT audit_logs_actor_id_fkey
FOREIGN KEY (actor_id) 
REFERENCES public.profiles(user_id) 
ON DELETE SET NULL;

-- Comentário explicativo
COMMENT ON COLUMN public.audit_logs.actor_id IS 'User ID que executou a ação (referencia profiles.user_id)';