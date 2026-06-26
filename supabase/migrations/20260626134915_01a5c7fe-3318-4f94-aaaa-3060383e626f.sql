-- D11-B: Trigger typegen regeneration to align database.types.ts with real schema.
-- The column public.agents.version (integer, optimistic locking) exists in the DB
-- but is missing from the generated types, causing TS2344/TS2352/TS2365 drift in
-- heartbeat/state-updater.ts. A no-op COMMENT bumps the schema fingerprint so
-- the platform regenerates supabase/functions/_shared/database.types.ts and
-- src/integrations/supabase/types.ts to include it.
COMMENT ON COLUMN public.agents.version IS 'Optimistic locking counter used by update_agent_state_atomic (incremented on each successful state update).';
COMMENT ON COLUMN public.agents.last_heartbeat IS 'Timestamp of the last heartbeat received from the agent.';