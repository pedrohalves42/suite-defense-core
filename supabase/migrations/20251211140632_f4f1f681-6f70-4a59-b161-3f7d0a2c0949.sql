-- Indice para acelerar cleanup de hmac_signatures antigas
CREATE INDEX IF NOT EXISTS idx_hmac_signatures_used_at 
ON hmac_signatures (used_at);