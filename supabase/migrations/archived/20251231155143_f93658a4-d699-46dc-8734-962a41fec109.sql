-- Fix: Drop SECURITY DEFINER view and recreate with SECURITY INVOKER (default)
DROP VIEW IF EXISTS insight_feedback_quality;

-- Recreate view with SECURITY INVOKER (uses caller's permissions)
CREATE VIEW insight_feedback_quality 
WITH (security_invoker = true) AS
SELECT
  ai.insight_type,
  f.tenant_id,
  COUNT(*) AS total_feedback,
  COUNT(*) FILTER (WHERE f.feedback_type = 'useful') AS useful,
  COUNT(*) FILTER (WHERE f.feedback_type = 'noise') AS noise,
  COUNT(*) FILTER (WHERE f.feedback_type = 'false_positive') AS false_positive,
  ROUND(
    COUNT(*) FILTER (WHERE f.feedback_type = 'useful')::numeric
    / NULLIF(COUNT(*), 0) * 100, 2
  ) AS usefulness_rate
FROM ai_insight_feedback f
JOIN ai_insights ai ON ai.id = f.insight_id
GROUP BY ai.insight_type, f.tenant_id;