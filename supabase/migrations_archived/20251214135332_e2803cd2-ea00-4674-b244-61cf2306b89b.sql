-- Add commercial fields to generated_reports for V4 Sales Engine
ALTER TABLE public.generated_reports 
ADD COLUMN IF NOT EXISTS sales_status TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS next_action TEXT,
ADD COLUMN IF NOT EXISTS commercial_summary TEXT,
ADD COLUMN IF NOT EXISTS commercial_priority TEXT DEFAULT 'low',
ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ;

-- Add check constraint for valid sales_status values
ALTER TABLE public.generated_reports 
ADD CONSTRAINT chk_sales_status CHECK (sales_status IN ('open', 'contacted', 'negotiated', 'closed_won', 'closed_lost'));

-- Add check constraint for valid commercial_priority values
ALTER TABLE public.generated_reports 
ADD CONSTRAINT chk_commercial_priority CHECK (commercial_priority IN ('high', 'medium', 'low'));

-- Add check constraint for valid next_action values
ALTER TABLE public.generated_reports 
ADD CONSTRAINT chk_next_action CHECK (next_action IS NULL OR next_action IN ('schedule_call', 'send_whatsapp', 'await_client', 'send_email', 'close_deal'));

-- Create index for commercial pipeline queries
CREATE INDEX IF NOT EXISTS idx_generated_reports_sales_status ON public.generated_reports(sales_status);
CREATE INDEX IF NOT EXISTS idx_generated_reports_commercial_priority ON public.generated_reports(commercial_priority);
CREATE INDEX IF NOT EXISTS idx_generated_reports_follow_up ON public.generated_reports(follow_up_at) WHERE follow_up_at IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN public.generated_reports.sales_status IS 'Pipeline status: open ? contacted ? negotiated ? closed_won/closed_lost';
COMMENT ON COLUMN public.generated_reports.commercial_summary IS 'Ready-to-send text for WhatsApp/Email - auto-generated';
COMMENT ON COLUMN public.generated_reports.commercial_priority IS 'Notification priority based on risk_score: high (?60), medium (?30), low (<30)';