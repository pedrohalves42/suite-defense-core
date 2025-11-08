-- Create invites table for user invitations
CREATE TABLE public.invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  role app_role NOT NULL,
  token TEXT NOT NULL UNIQUE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Admins can manage invites in their tenant
CREATE POLICY "Admins can manage invites in their tenant"
  ON public.invites
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id())
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND tenant_id = current_user_tenant_id());

-- Service role has full access
CREATE POLICY "Service role has full access to invites"
  ON public.invites
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_invites_token ON public.invites(token);
CREATE INDEX idx_invites_email ON public.invites(email);
CREATE INDEX idx_invites_status ON public.invites(status);
CREATE INDEX idx_invites_tenant_id ON public.invites(tenant_id);