-- Enable realtime for ai_insights table
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_insights;

-- Create trigger function to call ai-insight-dispatcher on new insights with auto_action_mode != 'none'
CREATE OR REPLACE FUNCTION public.notify_ai_insight_dispatcher()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  edge_url TEXT;
  service_key TEXT;
BEGIN
  -- Only process if auto_action_mode is not 'none'
  IF NEW.auto_action_mode IS NOT NULL AND NEW.auto_action_mode != 'none' THEN
    edge_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);
    
    -- Use pg_net to call the dispatcher asynchronously
    PERFORM net.http_post(
      url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/ai-insight-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'insight_id', NEW.id,
        'tenant_id', NEW.tenant_id,
        'auto_action_mode', NEW.auto_action_mode
      )
    );
    
    RAISE LOG '[notify_ai_insight_dispatcher] Dispatched insight % with mode %', NEW.id, NEW.auto_action_mode;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new ai_insights
DROP TRIGGER IF EXISTS trigger_ai_insight_auto_dispatch ON public.ai_insights;
CREATE TRIGGER trigger_ai_insight_auto_dispatch
  AFTER INSERT ON public.ai_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_ai_insight_dispatcher();