-- Clean old data from base tables (>30 days)
DELETE FROM public.endpoint_process_events 
WHERE event_time < NOW() - INTERVAL '30 days';

DELETE FROM public.endpoint_network_events 
WHERE event_time < NOW() - INTERVAL '30 days';

DELETE FROM public.endpoint_event_buffer 
WHERE received_at < NOW() - INTERVAL '30 days';