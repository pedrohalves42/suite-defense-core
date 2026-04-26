-- Fix security warnings: add search_path to trigger functions

CREATE OR REPLACE FUNCTION public.prevent_playbook_execution_modification()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Impedir alteracao apos conclusao/cancelamento/falha
  IF OLD.status IN ('completed', 'cancelled', 'failed', 'ignored') THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: Playbook execution is immutable after completion. Status: %', OLD.status
      USING ERRCODE = '23514';
  END IF;
  
  -- Impedir alteracao de snapshots apos criacao
  IF OLD.playbook_snapshot IS NOT NULL AND NEW.playbook_snapshot IS DISTINCT FROM OLD.playbook_snapshot THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: playbook_snapshot cannot be modified after creation'
      USING ERRCODE = '23514';
  END IF;
  
  IF OLD.actions_snapshot IS NOT NULL AND NEW.actions_snapshot IS DISTINCT FROM OLD.actions_snapshot THEN
    RAISE EXCEPTION 'IMMUTABLE_VIOLATION: actions_snapshot cannot be modified after creation'
      USING ERRCODE = '23514';
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_playbook_version()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Incrementar versao quando playbook e modificado (exceto updated_at)
  IF (NEW.name IS DISTINCT FROM OLD.name) OR
     (NEW.description IS DISTINCT FROM OLD.description) OR
     (NEW.trigger_type IS DISTINCT FROM OLD.trigger_type) OR
     (NEW.trigger_conditions IS DISTINCT FROM OLD.trigger_conditions) OR
     (NEW.severity IS DISTINCT FROM OLD.severity) OR
     (NEW.require_approval IS DISTINCT FROM OLD.require_approval) THEN
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;