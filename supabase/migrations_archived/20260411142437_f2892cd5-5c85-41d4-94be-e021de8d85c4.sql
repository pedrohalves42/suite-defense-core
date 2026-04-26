CREATE OR REPLACE FUNCTION public.redirect_network_events_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.endpoint_network_events_partitioned 
    (id, tenant_id, agent_id, event_type, protocol, local_address,
     local_port, remote_address, remote_port, direction,
     process_name, process_pid, bytes_sent, bytes_received,
     domain, dns_query_type, dns_response, is_suspicious,
     detection_tags, geo_country, event_time, created_at)
  VALUES 
    (NEW.id, NEW.tenant_id, NEW.agent_id, NEW.event_type, NEW.protocol, NEW.local_address,
     NEW.local_port, NEW.remote_address, NEW.remote_port, NEW.direction,
     NEW.process_name, NEW.process_pid, NEW.bytes_sent, NEW.bytes_received,
     NEW.domain, NEW.dns_query_type, NEW.dns_response, NEW.is_suspicious,
     NEW.detection_tags, NEW.geo_country, NEW.event_time, NEW.created_at);
  RETURN NULL;
END;
$$;