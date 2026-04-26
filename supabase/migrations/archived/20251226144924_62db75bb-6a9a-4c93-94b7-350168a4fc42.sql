-- Add last_block_sync_at column to agents table for tracking sync status
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS last_block_sync_at TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN public.agents.last_block_sync_at IS 'Timestamp of last successful blocked websites sync';

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_agents_last_block_sync_at ON public.agents(last_block_sync_at);

-- Enable realtime on blocked_access_attempts for live notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.blocked_access_attempts;