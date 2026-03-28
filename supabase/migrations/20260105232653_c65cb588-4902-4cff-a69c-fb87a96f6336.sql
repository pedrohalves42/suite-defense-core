-- Adicionar colunas de aprovacao a security_policies
ALTER TABLE public.security_policies 
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by UUID;

-- Comentarios de documentacao
COMMENT ON COLUMN public.security_policies.approved_at IS 'Timestamp when policy was formally approved - required for CC2 compliance';
COMMENT ON COLUMN public.security_policies.approved_by IS 'User ID who approved the policy - required for CC2 compliance';