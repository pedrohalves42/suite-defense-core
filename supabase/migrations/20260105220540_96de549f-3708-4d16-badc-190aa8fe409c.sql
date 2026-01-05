-- Ajuste 3: Adicionar campos de dismissal para evidência de discordância
ALTER TABLE public.ai_insights 
ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS dismissed_by UUID,
ADD COLUMN IF NOT EXISTS dismissal_reason TEXT;

-- Índice para queries de dismissed
CREATE INDEX IF NOT EXISTS idx_ai_insights_dismissed_at ON public.ai_insights(dismissed_at) WHERE dismissed_at IS NOT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.ai_insights.dismissed_at IS 'Timestamp when insight was dismissed (evidence of human disagreement with AI)';
COMMENT ON COLUMN public.ai_insights.dismissed_by IS 'User who dismissed the insight';
COMMENT ON COLUMN public.ai_insights.dismissal_reason IS 'Reason for dismissing the insight';