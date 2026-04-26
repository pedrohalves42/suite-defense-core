-- Tabela de fila de notificacoes
CREATE TABLE public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.generated_reports(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email', 'dashboard')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('high', 'normal', 'low')),
  recipient TEXT,
  message_content TEXT,
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their tenant notifications"
ON public.notification_queue FOR SELECT
USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert notifications for their tenant"
ON public.notification_queue FOR INSERT
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their tenant notifications"
ON public.notification_queue FOR UPDATE
USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- Indexes for performance
CREATE INDEX idx_notification_queue_tenant_status ON public.notification_queue(tenant_id, status);
CREATE INDEX idx_notification_queue_scheduled ON public.notification_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_notification_queue_report ON public.notification_queue(report_id);

-- Function to get report frequency days by plan
CREATE OR REPLACE FUNCTION public.get_report_frequency_days(p_plan_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE p_plan_name
    WHEN 'free' THEN NULL -- Trial: single report only
    WHEN 'starter' THEN 30 -- Monthly
    WHEN 'pro' THEN 14 -- Bi-weekly
    WHEN 'business' THEN 14 -- Bi-weekly
    WHEN 'scale' THEN 7 -- Weekly
    WHEN 'enterprise' THEN 7 -- Weekly
    ELSE 30 -- Default monthly for residential plans
  END;
END;
$$;