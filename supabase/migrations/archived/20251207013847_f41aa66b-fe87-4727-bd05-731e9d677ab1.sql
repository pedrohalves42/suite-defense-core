-- Create notification_channels table
CREATE TABLE public.notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('whatsapp', 'telegram', 'email', 'sms')),
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  is_verified BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.notification_channels(id) ON DELETE CASCADE,
  alert_types TEXT[] NOT NULL DEFAULT '{}',
  severity_filter TEXT[] NOT NULL DEFAULT ARRAY['critical', 'high', 'medium'],
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_timezone TEXT DEFAULT 'America/Sao_Paulo',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, channel_id)
);

-- Create notification_log table
CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.notification_channels(id) ON DELETE SET NULL,
  alert_id UUID REFERENCES public.system_alerts(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  external_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_notification_channels_tenant ON public.notification_channels(tenant_id);
CREATE INDEX idx_notification_channels_type ON public.notification_channels(channel_type);
CREATE INDEX idx_notification_preferences_tenant ON public.notification_preferences(tenant_id);
CREATE INDEX idx_notification_preferences_channel ON public.notification_preferences(channel_id);
CREATE INDEX idx_notification_log_tenant ON public.notification_log(tenant_id);
CREATE INDEX idx_notification_log_alert ON public.notification_log(alert_id);
CREATE INDEX idx_notification_log_status ON public.notification_log(status);
CREATE INDEX idx_notification_log_created ON public.notification_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notification_channels
CREATE POLICY "Admins can manage notification channels in their tenant"
ON public.notification_channels
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND tenant_id = notification_channels.tenant_id
    AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND tenant_id = notification_channels.tenant_id
    AND role IN ('admin', 'super_admin')
  )
);

-- RLS Policies for notification_preferences
CREATE POLICY "Admins can manage notification preferences in their tenant"
ON public.notification_preferences
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND tenant_id = notification_preferences.tenant_id
    AND role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND tenant_id = notification_preferences.tenant_id
    AND role IN ('admin', 'super_admin')
  )
);

-- RLS Policies for notification_log
CREATE POLICY "Admins can view notification logs in their tenant"
ON public.notification_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND tenant_id = notification_log.tenant_id
    AND role IN ('admin', 'super_admin')
  )
);

CREATE POLICY "System can insert notification logs"
ON public.notification_log
FOR INSERT
WITH CHECK (true);

-- Update timestamp trigger
CREATE TRIGGER update_notification_channels_updated_at
  BEFORE UPDATE ON public.notification_channels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenant_settings_updated_at();

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenant_settings_updated_at();