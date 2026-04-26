-- Function to create recurring jobs for new agents
CREATE OR REPLACE FUNCTION public.create_recurring_jobs_for_agent()
RETURNS TRIGGER AS $$
DECLARE
  job_types TEXT[] := ARRAY['software_inventory_collect', 'light_vuln_scan', 'collect_antivirus_status', 'collect_web_activity'];
  job_type TEXT;
BEGIN
  -- Create 4 recurring jobs for the new agent
  FOREACH job_type IN ARRAY job_types
  LOOP
    INSERT INTO public.jobs (
      agent_name,
      agent_id,
      tenant_id,
      type,
      status,
      approved,
      is_recurring,
      recurrence_pattern,
      next_run_at,
      payload
    ) VALUES (
      NEW.agent_name,
      NEW.id,
      NEW.tenant_id,
      job_type,
      'queued',
      true,
      true,
      'daily',
      (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '19 hours')::timestamptz, -- 16h Brasilia = 19h UTC
      jsonb_build_object('auto_created', true, 'created_for_agent', NEW.agent_name)
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-create jobs when agent is enrolled
DROP TRIGGER IF EXISTS tr_create_recurring_jobs_for_new_agent ON public.agents;
CREATE TRIGGER tr_create_recurring_jobs_for_new_agent
  AFTER INSERT ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION public.create_recurring_jobs_for_agent();

-- Add comment for documentation
COMMENT ON FUNCTION public.create_recurring_jobs_for_agent() IS 'Automatically creates 4 recurring security jobs (software inventory, vulnerability scan, antivirus status, web activity) when a new agent is enrolled';