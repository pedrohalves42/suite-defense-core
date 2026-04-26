-- Create the ops_checks table
CREATE TABLE IF NOT EXISTS public.ops_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ops_checks ENABLE ROW LEVEL SECURITY;

-- Create policies (Assuming superadmins or internal functions need access)
CREATE POLICY "Allow all for authenticated users" ON public.ops_checks
    FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Trigger for updated_at
CREATE TRIGGER update_ops_checks_updated_at
BEFORE UPDATE ON public.ops_checks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed some initial data if needed, or just let it be empty
INSERT INTO public.ops_checks (name, is_active)
VALUES 
    ('monitor-thresholds', true),
    ('health-monitor', true),
    ('watchdog-non-execution', true),
    ('check-action-effectiveness', true),
    ('analyze-job-failure-patterns', true),
    ('check-task-sla-breach', true),
    ('evaluate-job-slo', true),
    ('check-installation-health', true),
    ('detect-stuck-installations', true),
    ('get-installation-pipeline-metrics', true),
    ('cron-sentinel', true),
    ('check-stuck-jobs', true),
    ('check-pending-agents', true),
    ('build-watchdog', true),
    ('calculate-behavioral-baselines', true),
    ('compute-compliance-benchmarks', true)
ON CONFLICT (name) DO NOTHING;
