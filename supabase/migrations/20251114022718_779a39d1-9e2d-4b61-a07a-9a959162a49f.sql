
-- Adicionar colunas necessarias para telemetria HMAC
ALTER TABLE public.installation_analytics 
ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS network_connectivity BOOLEAN DEFAULT true;

-- Criar indices para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS idx_installation_analytics_success 
ON public.installation_analytics(success);

CREATE INDEX IF NOT EXISTS idx_installation_analytics_event_type_created 
ON public.installation_analytics(event_type, created_at DESC);

-- Comentarios explicativos
COMMENT ON COLUMN public.installation_analytics.success IS 'Indica se a instalacao foi bem-sucedida';
COMMENT ON COLUMN public.installation_analytics.network_connectivity IS 'Indica se havia conectividade de rede durante a instalacao';
