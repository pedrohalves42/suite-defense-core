-- =============================================================================
-- Fix: notify_ai_insight_dispatcher trigger to send complete insight object
-- Problem: Trigger was sending only insight_id, but dispatcher expects full insight object
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_ai_insight_dispatcher()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  service_key TEXT;
BEGIN
  -- Only process if auto_action_mode is not 'none'
  IF NEW.auto_action_mode IS NOT NULL AND NEW.auto_action_mode != 'none' THEN
    service_key := current_setting('app.settings.service_role_key', true);
    
    -- Use pg_net to call the dispatcher asynchronously
    -- FIXED: Send complete insight object with all required fields
    PERFORM net.http_post(
      url := 'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/ai-insight-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object(
        'insight', jsonb_build_object(
          'id', NEW.id,
          'tenant_id', NEW.tenant_id,
          'agent_id', NEW.agent_id,
          'insight_type', NEW.insight_type,
          'severity', NEW.severity,
          'title', NEW.title,
          'description', NEW.description,
          'evidence', COALESCE(NEW.evidence, '{}'::jsonb),
          'recommendation', NEW.recommendation,
          'confidence_score', NEW.confidence_score,
          'auto_action_mode', NEW.auto_action_mode,
          'category', NEW.category,
          'recommended_actions', COALESCE(NEW.recommended_actions, '[]'::jsonb)
        ),
        'source', 'trigger'
      )
    );
    
    RAISE LOG '[notify_ai_insight_dispatcher] Dispatched insight % with mode %', NEW.id, NEW.auto_action_mode;
  END IF;
  
  RETURN NEW;
END;
$function$;