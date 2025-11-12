-- Adicionar coluna para tracking de notificações de expiração
ALTER TABLE enrollment_keys 
ADD COLUMN IF NOT EXISTS expiration_notified_at TIMESTAMP WITH TIME ZONE;

-- Criar índice para buscar keys expirando que não foram notificadas
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_expiring 
ON enrollment_keys(expires_at, expiration_notified_at, is_active) 
WHERE expiration_notified_at IS NULL AND is_active = true;

COMMENT ON COLUMN enrollment_keys.expiration_notified_at IS 'Timestamp quando admin foi notificado sobre expiração próxima (1h antes)';
COMMENT ON INDEX idx_enrollment_keys_expiring IS 'Otimiza busca de keys expirando em breve para sistema de notificações';