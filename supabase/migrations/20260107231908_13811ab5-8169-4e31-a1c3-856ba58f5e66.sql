-- Fix security definer views by adding security_invoker

ALTER VIEW public.v_tasks_requiring_closure SET (security_invoker = on);
ALTER VIEW public.v_governance_stats SET (security_invoker = on);