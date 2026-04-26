-- =============================================================================
-- Phase 1.3: Add updated_at column to ai_insights table
-- =============================================================================
-- This fixes INSIGHT_IGNORED_009 rule that needs to escalate ignored insights
-- =============================================================================

-- Add the column if it doesn't exist
ALTER TABLE ai_insights 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create trigger function for auto-updating
CREATE OR REPLACE FUNCTION public.update_ai_insights_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_ai_insights_updated_at ON ai_insights;

CREATE TRIGGER trigger_ai_insights_updated_at
  BEFORE UPDATE ON ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_insights_updated_at();

COMMENT ON COLUMN ai_insights.updated_at IS 'Timestamp of last modification, auto-updated by trigger';