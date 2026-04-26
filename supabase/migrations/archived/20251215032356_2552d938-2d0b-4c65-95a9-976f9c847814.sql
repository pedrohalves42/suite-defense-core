-- Adicionar configuracao de horario de expediente
ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{
  "enabled": true,
  "timezone": "America/Sao_Paulo",
  "days": [1, 2, 3, 4, 5],
  "start": "08:00",
  "end": "18:00"
}'::jsonb;

-- Comentario para documentacao
COMMENT ON COLUMN public.tenant_settings.business_hours IS 'Configuracao de horario de expediente para alertas de agentes offline. days: 0=Dom, 1=Seg, ..., 6=Sab';