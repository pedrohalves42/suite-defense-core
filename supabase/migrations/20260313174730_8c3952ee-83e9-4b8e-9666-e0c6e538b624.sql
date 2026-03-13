
-- Add event aggregation configuration columns to agent_light_mode_configs
ALTER TABLE public.agent_light_mode_configs 
  ADD COLUMN IF NOT EXISTS aggregation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS aggregation_window_seconds integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS aggregation_file_threshold integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS aggregation_process_threshold integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS aggregation_network_threshold integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS aggregation_max_buffer_size integer NOT NULL DEFAULT 500;

COMMENT ON COLUMN public.agent_light_mode_configs.aggregation_enabled IS 'Enable edge event aggregation on the agent';
COMMENT ON COLUMN public.agent_light_mode_configs.aggregation_window_seconds IS 'Time window in seconds for grouping similar events';
COMMENT ON COLUMN public.agent_light_mode_configs.aggregation_file_threshold IS 'Min file events in window to trigger aggregation';
COMMENT ON COLUMN public.agent_light_mode_configs.aggregation_process_threshold IS 'Min process events in window to trigger aggregation';
COMMENT ON COLUMN public.agent_light_mode_configs.aggregation_network_threshold IS 'Min network events in window to trigger aggregation';
COMMENT ON COLUMN public.agent_light_mode_configs.aggregation_max_buffer_size IS 'Max events to buffer before forced flush';
