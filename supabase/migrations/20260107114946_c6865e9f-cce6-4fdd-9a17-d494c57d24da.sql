-- Create function to auto-resolve resource alerts when metrics normalize
CREATE OR REPLACE FUNCTION public.auto_resolve_resource_alerts()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-resolve high_cpu alerts when CPU < 80%
  IF NEW.cpu_usage_percent IS NOT NULL AND NEW.cpu_usage_percent < 80 THEN
    UPDATE system_alerts 
    SET resolved = true, resolved_at = NOW()
    WHERE tenant_id = NEW.tenant_id 
      AND alert_type IN ('high_cpu', 'cpu_warning')
      AND resolved = false
      AND agent_id = NEW.agent_id;
  END IF;
  
  -- Auto-resolve memory alerts when < 85%
  IF NEW.memory_usage_percent IS NOT NULL AND NEW.memory_usage_percent < 85 THEN
    UPDATE system_alerts 
    SET resolved = true, resolved_at = NOW()
    WHERE tenant_id = NEW.tenant_id 
      AND alert_type IN ('high_memory', 'memory_warning')
      AND resolved = false
      AND agent_id = NEW.agent_id;
  END IF;
  
  -- Auto-resolve disk alerts when < 85%
  IF NEW.disk_usage_percent IS NOT NULL AND NEW.disk_usage_percent < 85 THEN
    UPDATE system_alerts 
    SET resolved = true, resolved_at = NOW()
    WHERE tenant_id = NEW.tenant_id 
      AND alert_type IN ('high_disk', 'disk_warning')
      AND resolved = false
      AND agent_id = NEW.agent_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on agent_system_metrics
DROP TRIGGER IF EXISTS tr_auto_resolve_resource_alerts ON agent_system_metrics;
CREATE TRIGGER tr_auto_resolve_resource_alerts
  AFTER INSERT ON agent_system_metrics
  FOR EACH ROW
  EXECUTE FUNCTION auto_resolve_resource_alerts();