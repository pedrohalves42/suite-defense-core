-- Add effectiveness tracking fields to ai_actions
ALTER TABLE ai_actions
ADD COLUMN IF NOT EXISTS effectiveness_status TEXT
  CHECK (effectiveness_status IN (
    'pending',
    'resolved',
    'partial',
    'failed',
    'unknown'
  )) DEFAULT 'pending';

ALTER TABLE ai_actions
ADD COLUMN IF NOT EXISTS effectiveness_checked_at TIMESTAMPTZ;

ALTER TABLE ai_actions
ADD COLUMN IF NOT EXISTS effectiveness_evidence JSONB DEFAULT '{}';

COMMENT ON COLUMN ai_actions.effectiveness_status IS 'Outcome of post-action verification: pending, resolved, partial, failed, unknown';
COMMENT ON COLUMN ai_actions.effectiveness_checked_at IS 'Timestamp when effectiveness was last verified';
COMMENT ON COLUMN ai_actions.effectiveness_evidence IS 'Technical evidence collected during post-check verification';

-- Add final_outcome to ai_insights for aggregate tracking
ALTER TABLE ai_insights
ADD COLUMN IF NOT EXISTS final_outcome TEXT
  CHECK (final_outcome IN (
    'resolved',
    'partial',
    'failed'
  ));

COMMENT ON COLUMN ai_insights.final_outcome IS 'Final observed outcome after post-check verification';

-- Create index for pending effectiveness checks (optimizes scheduled job)
CREATE INDEX IF NOT EXISTS idx_ai_actions_effectiveness_pending
ON ai_actions (effectiveness_status, executed_at)
WHERE effectiveness_status = 'pending';

-- Create index for insight lookups
CREATE INDEX IF NOT EXISTS idx_ai_actions_insight_id
ON ai_actions (insight_id);

-- Update existing executed actions to pending status for verification
UPDATE ai_actions
SET effectiveness_status = 'pending'
WHERE status = 'executed'
  AND effectiveness_status IS NULL;