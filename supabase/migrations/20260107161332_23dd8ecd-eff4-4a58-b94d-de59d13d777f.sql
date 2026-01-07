-- Add rejection fields to ai_insights table
ALTER TABLE ai_insights 
ADD COLUMN IF NOT EXISTS rejection_reason text,
ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id);

-- Add index for faster queries on rejected insights
CREATE INDEX IF NOT EXISTS idx_ai_insights_rejected_at ON ai_insights(rejected_at) WHERE rejected_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN ai_insights.rejection_reason IS 'Human-provided reason for rejecting AI insight (false positive, not relevant, etc.)';
COMMENT ON COLUMN ai_insights.rejected_at IS 'Timestamp when the insight was rejected by user';
COMMENT ON COLUMN ai_insights.rejected_by IS 'User ID who rejected the insight';