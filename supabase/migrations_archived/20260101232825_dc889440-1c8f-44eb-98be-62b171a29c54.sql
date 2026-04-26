-- Add decision_source and decision_type columns to decision_events
ALTER TABLE public.decision_events
ADD COLUMN IF NOT EXISTS decision_source text CHECK (decision_source IS NULL OR decision_source IN ('human', 'ai', 'system', 'policy', 'resilience_engine')),
ADD COLUMN IF NOT EXISTS decision_type text CHECK (decision_type IS NULL OR decision_type IN ('approval', 'rejection', 'escalation', 'system'));