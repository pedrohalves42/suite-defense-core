-- Corrigir schema da extensão pgcrypto
-- A extensão estava em extensions schema, precisa estar em public para ser acessível

DROP EXTENSION IF EXISTS pgcrypto CASCADE;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

-- Verificar que a função digest está acessível
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'digest' AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'pgcrypto extension not properly installed in public schema';
  END IF;
END $$;