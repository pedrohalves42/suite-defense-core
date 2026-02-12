
-- SSA-SEC-009: Harden domain_events INSERT policy to service_role only
-- Authenticated users should not insert domain events directly; 
-- only the backend (via PersistentDomainEventPublisher) should.

DROP POLICY IF EXISTS "Service role can insert domain events" ON public.domain_events;

CREATE POLICY "Only service_role can insert domain events"
ON public.domain_events
FOR INSERT
TO service_role
WITH CHECK (true);

-- Ensure anon has zero access to hexagonal tables
REVOKE ALL ON public.domain_events FROM anon;
REVOKE ALL ON public.update_packages FROM anon;
REVOKE ALL ON public.agent_updates FROM anon;

-- Add documentation comments for service_role policies (V-103 compliance)
COMMENT ON TABLE public.domain_events IS 'Immutable append-only event store. INSERT restricted to service_role (Edge Functions). V-103 documented.';
COMMENT ON TABLE public.update_packages IS 'Hexagonal update package registry. Admin-managed via authenticated role. V-103 documented.';
COMMENT ON TABLE public.agent_updates IS 'Agent update lifecycle tracking (FSM). V-103 documented.';

-- Create index for domain_events query performance
CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate 
ON public.domain_events (aggregate_type, aggregate_id, occurred_on DESC);

CREATE INDEX IF NOT EXISTS idx_domain_events_tenant_type 
ON public.domain_events (tenant_id, event_type, occurred_on DESC);
