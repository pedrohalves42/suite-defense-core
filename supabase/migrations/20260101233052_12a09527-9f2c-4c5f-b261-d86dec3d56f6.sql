-- Drop existing constraints that are too restrictive
ALTER TABLE public.ai_insights DROP CONSTRAINT IF EXISTS ai_insights_final_outcome_check;
ALTER TABLE public.ai_insights DROP CONSTRAINT IF EXISTS ai_insights_status_check;
ALTER TABLE public.ai_insights DROP CONSTRAINT IF EXISTS ai_insights_resolution_method_check;

-- Recreate with expanded values
ALTER TABLE public.ai_insights 
ADD CONSTRAINT ai_insights_final_outcome_check 
CHECK (final_outcome IS NULL OR final_outcome IN ('resolved', 'partial', 'failed', 'no_action_required'));

ALTER TABLE public.ai_insights 
ADD CONSTRAINT ai_insights_status_check 
CHECK (status IN ('open', 'in_progress', 'resolved', 'ignored', 'failed', 'reviewed_no_action'));

ALTER TABLE public.ai_insights 
ADD CONSTRAINT ai_insights_resolution_method_check 
CHECK (resolution_method IS NULL OR resolution_method IN ('human_review', 'automated_action', 'policy_enforcement', 'manual_dismiss', 'manual_review_no_action', 'no_action_available'));