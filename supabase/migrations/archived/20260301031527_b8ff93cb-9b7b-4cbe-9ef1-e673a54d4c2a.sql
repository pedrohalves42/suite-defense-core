
-- M-002 FIX: Revogar EXECUTE de anon na trigger function
REVOKE EXECUTE ON FUNCTION public.auto_clear_force_update_on_match() FROM anon, public;
