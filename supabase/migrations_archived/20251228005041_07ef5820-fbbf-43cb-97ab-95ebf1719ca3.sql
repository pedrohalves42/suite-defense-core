-- V4: Add pending downgrade columns to tenant_subscriptions
ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS pending_downgrade_to TEXT,
  ADD COLUMN IF NOT EXISTS pending_downgrade_at TIMESTAMPTZ;

-- Add index for finding subscriptions with pending downgrades
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_pending_downgrade 
  ON public.tenant_subscriptions (pending_downgrade_at) 
  WHERE pending_downgrade_to IS NOT NULL;

-- Add comments
COMMENT ON COLUMN public.tenant_subscriptions.pending_downgrade_to IS 'V4: Plan name to downgrade to at period end';
COMMENT ON COLUMN public.tenant_subscriptions.pending_downgrade_at IS 'V4: When the downgrade will take effect';