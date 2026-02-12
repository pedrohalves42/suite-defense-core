
-- =========================================================================
-- Domain Events Table + Security Fixes (V-401, V-403, V-404)
-- =========================================================================

-- 1. Domain Events Table
CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_id text NOT NULL,
  aggregate_type text NOT NULL,
  event_type text NOT NULL,
  event_version integer NOT NULL DEFAULT 1,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_on timestamp with time zone NOT NULL DEFAULT now(),
  tenant_id uuid REFERENCES public.tenants(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view domain events for their tenant"
ON public.domain_events FOR SELECT TO authenticated
USING (
  tenant_id = get_active_tenant_id() 
  OR tenant_id IS NULL 
  OR is_current_super_admin()
);

CREATE POLICY "Service role can insert domain events"
ON public.domain_events FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = get_active_tenant_id() 
  OR tenant_id IS NULL
);

-- Allow service_role full access for edge functions
CREATE POLICY "Service role full access to domain events"
ON public.domain_events FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Immutability: domain events are append-only
CREATE OR REPLACE FUNCTION public.prevent_domain_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Domain events are immutable (append-only)' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER tr_prevent_domain_event_mutation
BEFORE UPDATE OR DELETE ON public.domain_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_domain_event_mutation();

-- Indexes
CREATE INDEX idx_domain_events_aggregate ON public.domain_events(aggregate_id, aggregate_type);
CREATE INDEX idx_domain_events_tenant_time ON public.domain_events(tenant_id, occurred_on DESC);
CREATE INDEX idx_domain_events_type ON public.domain_events(event_type, occurred_on DESC);

-- Revoke anon access
REVOKE ALL ON public.domain_events FROM anon;

COMMENT ON TABLE public.domain_events IS 'Immutable append-only store for domain events. Used for audit trail and event sourcing. ADR-001 Hexagonal Architecture.';
