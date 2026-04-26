-- Fix 1: Grant SELECT on v_integrity_score to authenticated users
GRANT SELECT ON public.v_integrity_score TO authenticated;

-- Fix 2: Update ai_insights status check constraint to include 'rejected'
ALTER TABLE public.ai_insights DROP CONSTRAINT ai_insights_status_check;
ALTER TABLE public.ai_insights ADD CONSTRAINT ai_insights_status_check 
  CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'ignored'::text, 'failed'::text, 'reviewed_no_action'::text, 'rejected'::text]));