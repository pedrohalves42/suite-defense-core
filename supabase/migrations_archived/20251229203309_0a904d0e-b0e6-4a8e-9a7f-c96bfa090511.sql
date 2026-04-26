-- ============================================
-- SAFE MODE OVERRIDE - EXPIRATION GUARDRAIL
-- ============================================

-- Adicionar coluna de expiracao para evitar override esquecido
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS force_update_override_safe_mode_expires_at timestamptz;

COMMENT ON COLUMN agents.force_update_override_safe_mode_expires_at IS 
'Optional expiration timestamp for safe mode override to avoid permanent bypass';