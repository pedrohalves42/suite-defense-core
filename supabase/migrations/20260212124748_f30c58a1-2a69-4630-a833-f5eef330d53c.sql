
-- Fix search_path for prevent_domain_event_mutation
CREATE OR REPLACE FUNCTION public.prevent_domain_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Domain events are immutable (append-only)' USING ERRCODE = '23514';
END;
$$;
