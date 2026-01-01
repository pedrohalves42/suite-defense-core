-- =====================================================
-- Migration: Add human_reviewed fields for governance evidence
-- =====================================================

-- Add human review fields to ai_actions
ALTER TABLE public.ai_actions
ADD COLUMN IF NOT EXISTS human_reviewed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS review_decision text CHECK (review_decision IS NULL OR review_decision IN ('approved', 'rejected', 'deferred')),
ADD COLUMN IF NOT EXISTS review_justification text;

-- Add human review fields to system_alerts
ALTER TABLE public.system_alerts
ADD COLUMN IF NOT EXISTS human_reviewed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reviewed_by uuid,
ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
ADD COLUMN IF NOT EXISTS resolution_notes text;

-- Add index for governance queries
CREATE INDEX IF NOT EXISTS idx_ai_actions_human_reviewed 
ON public.ai_actions(tenant_id, human_reviewed) 
WHERE human_reviewed = true;

CREATE INDEX IF NOT EXISTS idx_system_alerts_human_reviewed 
ON public.system_alerts(tenant_id, human_reviewed) 
WHERE human_reviewed = true;