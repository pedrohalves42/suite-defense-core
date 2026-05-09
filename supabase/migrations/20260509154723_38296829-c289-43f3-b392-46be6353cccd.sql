-- Add cost tracking to generated_reports
ALTER TABLE public.generated_reports 
ADD COLUMN IF NOT EXISTS token_usage JSONB DEFAULT '{"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}'::jsonb,
ADD COLUMN IF NOT EXISTS processing_cost NUMERIC(10, 6) DEFAULT 0.0;

-- Add usage metrics to ai_analysis_cache
ALTER TABLE public.ai_analysis_cache
ADD COLUMN IF NOT EXISTS hit_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_hit_at TIMESTAMPTZ;

-- Comment for documentation
COMMENT ON COLUMN public.generated_reports.processing_cost IS 'Cost in USD for the AI analysis of this report';
COMMENT ON COLUMN public.ai_analysis_cache.hit_count IS 'Number of times this cache entry was reused, indicating cost savings';
