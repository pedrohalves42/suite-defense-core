-- =============================================================================
-- Phase 1.3b: Fix search_path on trigger function
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_ai_insights_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;