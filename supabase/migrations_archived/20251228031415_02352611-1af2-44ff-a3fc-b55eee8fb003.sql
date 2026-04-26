-- Micro-ajuste 1: Default de 24h para approval_token_expires_at
ALTER TABLE approval_requests
ALTER COLUMN approval_token_expires_at
SET DEFAULT (now() + interval '24 hours');

-- Micro-ajuste 2: Constraint de coerencia token/expiracao
-- Garante que se existe token, deve existir expiracao
ALTER TABLE approval_requests
ADD CONSTRAINT approval_token_requires_expiry
CHECK (
  approval_token IS NULL
  OR approval_token_expires_at IS NOT NULL
);

COMMENT ON CONSTRAINT approval_token_requires_expiry ON approval_requests IS 'Defense in depth: tokens de aprovacao devem sempre ter expiracao definida';