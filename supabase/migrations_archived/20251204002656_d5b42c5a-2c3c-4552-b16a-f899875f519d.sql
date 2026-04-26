-- Create custom_trials table for tracking special trials
CREATE TABLE public.custom_trials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  trial_days INTEGER NOT NULL DEFAULT 45,
  trial_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trial_end TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'converted', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_trials ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage custom trials
CREATE POLICY "Super admins can manage custom trials"
ON public.custom_trials
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  )
);

-- Create index for performance
CREATE INDEX idx_custom_trials_tenant_id ON public.custom_trials(tenant_id);
CREATE INDEX idx_custom_trials_status ON public.custom_trials(status);
CREATE INDEX idx_custom_trials_email ON public.custom_trials(email);

-- Trigger for updated_at
CREATE TRIGGER update_custom_trials_updated_at
BEFORE UPDATE ON public.custom_trials
FOR EACH ROW
EXECUTE FUNCTION public.update_tenant_settings_updated_at();