-- Drop old partitions that are past 30-day retention
DROP TABLE IF EXISTS public.endpoint_event_buffer_partitioned_2026_03;
DROP TABLE IF EXISTS public.endpoint_process_events_partitioned_2026_03;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_02;
DROP TABLE IF EXISTS public.hmac_signatures_2026_02;