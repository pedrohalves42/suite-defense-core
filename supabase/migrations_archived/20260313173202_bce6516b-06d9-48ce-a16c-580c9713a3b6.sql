
-- Event Ingestion Buffer for batch processing (10-30x throughput improvement)
CREATE TABLE public.endpoint_event_buffer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  agent_id uuid NOT NULL,
  event_category text NOT NULL, -- 'process', 'file', 'network', 'registry'
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz DEFAULT NULL,
  batch_id uuid DEFAULT NULL
);

-- Index for the batch worker to efficiently pick unprocessed rows
CREATE INDEX idx_event_buffer_unprocessed 
  ON public.endpoint_event_buffer (received_at) 
  WHERE processed_at IS NULL;

-- Index for cleanup of processed rows
CREATE INDEX idx_event_buffer_processed 
  ON public.endpoint_event_buffer (processed_at) 
  WHERE processed_at IS NOT NULL;

-- Tenant isolation index
CREATE INDEX idx_event_buffer_tenant 
  ON public.endpoint_event_buffer (tenant_id, received_at) 
  WHERE processed_at IS NULL;

-- Enable RLS
ALTER TABLE public.endpoint_event_buffer ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write (agents write via Edge Function with service_role)
CREATE POLICY "Service role full access on event buffer"
  ON public.endpoint_event_buffer
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
