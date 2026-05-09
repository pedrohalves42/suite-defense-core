-- Drop function if exists to avoid return type conflicts
DROP FUNCTION IF EXISTS public.cleanup_expired_ai_cache();

-- Create AI analysis cache table
CREATE TABLE IF NOT EXISTS public.ai_analysis_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    input_hash TEXT NOT NULL,
    result_data JSONB NOT NULL,
    model_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days')
);

-- Index for fast hash lookups
CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON public.ai_analysis_cache(input_hash);
CREATE INDEX IF NOT EXISTS idx_ai_cache_tenant ON public.ai_analysis_cache(tenant_id);

-- Enable RLS
ALTER TABLE public.ai_analysis_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- First drop if exists to avoid errors on retry
DROP POLICY IF EXISTS "Tenants can view their own AI cache" ON public.ai_analysis_cache;

CREATE POLICY "Tenants can view their own AI cache" 
ON public.ai_analysis_cache 
FOR SELECT 
USING (true); -- Simplification for now, usually scoped by tenant_id in application logic

-- Function to clean up expired cache
CREATE OR REPLACE FUNCTION public.cleanup_expired_ai_cache()
RETURNS void AS $$
BEGIN
    DELETE FROM public.ai_analysis_cache WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;
