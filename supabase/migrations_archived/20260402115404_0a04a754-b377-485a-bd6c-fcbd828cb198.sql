
DROP INDEX IF EXISTS public.idx_file_events_path_trgm;
DROP INDEX IF EXISTS public.idx_network_events_domain_trgm;
DROP INDEX IF EXISTS public.idx_network_events_addr_trgm;
DROP INDEX IF EXISTS public.idx_process_events_name_trgm;
DROP INDEX IF EXISTS public.idx_process_events_cmdline_trgm;

DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

CREATE INDEX idx_file_events_path_trgm
  ON public.endpoint_file_events
  USING gin (file_path extensions.gin_trgm_ops);

CREATE INDEX idx_network_events_domain_trgm
  ON public.endpoint_network_events
  USING gin (domain extensions.gin_trgm_ops);

CREATE INDEX idx_network_events_addr_trgm
  ON public.endpoint_network_events
  USING gin (remote_address extensions.gin_trgm_ops);

CREATE INDEX idx_process_events_name_trgm
  ON public.endpoint_process_events
  USING gin (process_name extensions.gin_trgm_ops);

CREATE INDEX idx_process_events_cmdline_trgm
  ON public.endpoint_process_events
  USING gin (command_line extensions.gin_trgm_ops);
