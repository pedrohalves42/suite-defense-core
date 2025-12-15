-- Adicionar configuração de horário de expediente
ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{
  "enabled": true,
  "timezone": "America/Sao_Paulo",
  "days": [1, 2, 3, 4, 5],
  "start": "08:00",
  "end": "18:00"
}'::jsonb;

-- Comentário para documentação
COMMENT ON COLUMN public.tenant_settings.business_hours IS 'Configuração de horário de expediente para alertas de agentes offline. days: 0=Dom, 1=Seg, ..., 6=Sab';