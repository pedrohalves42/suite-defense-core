-- ============================================
-- ADICIONAR COLUNAS FALTANTES PARA AUDITORIA
-- ============================================

-- Adicionar reviewed_at a ai_actions
ALTER TABLE public.ai_actions 
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Adicionar verification_notes a soc2_controls
ALTER TABLE public.soc2_controls 
ADD COLUMN IF NOT EXISTS verification_notes TEXT;

-- ============================================
-- INDICES PARA PERFORMANCE
-- ============================================

-- Indice para queries de alertas por resolved/severity
CREATE INDEX IF NOT EXISTS idx_system_alerts_resolved_severity 
ON public.system_alerts(resolved, severity);

-- Indice para queries de controles verificados
CREATE INDEX IF NOT EXISTS idx_soc2_controls_verified 
ON public.soc2_controls(verified_at) WHERE verified_at IS NOT NULL;