-- =============================================================================
-- CI Guard: Validate ai_insights severity values
-- =============================================================================
-- This test ensures all ai_insights records have valid severity values.
-- Run this during migrations or CI to detect data integrity issues.
-- =============================================================================

DO $$
DECLARE
  invalid_count integer;
  valid_severities text[] := ARRAY['info', 'low', 'medium', 'warning', 'high', 'critical'];
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM ai_insights
  WHERE severity IS NOT NULL 
    AND severity != ALL(valid_severities);
  
  IF invalid_count > 0 THEN
    RAISE WARNING 
      'DATA VALIDATION WARNING: Found % records with invalid severity values in ai_insights',
      invalid_count;
  ELSE
    RAISE NOTICE 'DATA VALIDATION PASSED: All ai_insights severity values are valid';
  END IF;
END $$;
