-- FASE 1: Adicionar colunas para validação de integridade SHA256 dos instaladores
ALTER TABLE public.enrollment_keys 
ADD COLUMN IF NOT EXISTS installer_sha256 TEXT,
ADD COLUMN IF NOT EXISTS installer_size_bytes INTEGER,
ADD COLUMN IF NOT EXISTS installer_generated_at TIMESTAMPTZ;

-- Index para busca rápida por hash
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_installer_sha256 
ON public.enrollment_keys(installer_sha256) 
WHERE installer_sha256 IS NOT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.enrollment_keys.installer_sha256 IS 'SHA256 hash do script de instalação gerado (.PS1 ou .SH)';
COMMENT ON COLUMN public.enrollment_keys.installer_size_bytes IS 'Tamanho em bytes do script gerado';
COMMENT ON COLUMN public.enrollment_keys.installer_generated_at IS 'Timestamp de quando o instalador foi gerado';