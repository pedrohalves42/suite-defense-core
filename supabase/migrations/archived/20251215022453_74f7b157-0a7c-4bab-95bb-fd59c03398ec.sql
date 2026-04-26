-- Fix: Recriar view v_security_definer_inventory com security_invoker
DROP VIEW IF EXISTS public.v_security_definer_inventory;

CREATE OR REPLACE VIEW public.v_security_definer_inventory 
WITH (security_invoker = on) AS
SELECT 
  p.proname as function_name,
  n.nspname as schema_name,
  CASE 
    WHEN d.description LIKE '? Essencial%' THEN 'essential'
    WHEN d.description LIKE '? Legado%' THEN 'legacy'
    ELSE 'unclassified'
  END as category,
  COALESCE(d.description, 'Sem documentacao') as documentation,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_description d ON d.objoid = p.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY 
  CASE 
    WHEN d.description LIKE '? Essencial%' THEN 1
    WHEN d.description LIKE '? Legado%' THEN 2
    ELSE 3
  END,
  p.proname;

COMMENT ON VIEW public.v_security_definer_inventory IS 'Inventario de funcoes SECURITY DEFINER para auditoria (security_invoker=on)';