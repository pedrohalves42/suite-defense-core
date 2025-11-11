-- ============================================================================
-- FASE 1: CORREÇÕES DE SEGURANÇA PRIORITÁRIAS
-- ============================================================================

-- 1. Corrigir search_path da função calculate_next_run
-- Previne ataques de schema poisoning
CREATE OR REPLACE FUNCTION public.calculate_next_run(
  pattern text, 
  from_time timestamp with time zone DEFAULT now()
)
RETURNS timestamp with time zone
LANGUAGE plpgsql
SET search_path = public  -- ✅ FIX: Adicionar search_path
AS $function$
DECLARE
  next_time timestamp with time zone;
BEGIN
  -- Simple pattern parsing for common cases
  -- Format: "minutes hours day month weekday"
  -- Examples: 
  --   "0 * * * *" = every hour
  --   "*/5 * * * *" = every 5 minutes
  --   "0 0 * * *" = daily at midnight
  --   "0 0 * * 0" = weekly on Sunday
  
  -- For MVP, we'll handle simple intervals
  CASE pattern
    WHEN '*/5 * * * *' THEN next_time := from_time + INTERVAL '5 minutes';
    WHEN '*/15 * * * *' THEN next_time := from_time + INTERVAL '15 minutes';
    WHEN '*/30 * * * *' THEN next_time := from_time + INTERVAL '30 minutes';
    WHEN '0 * * * *' THEN next_time := date_trunc('hour', from_time) + INTERVAL '1 hour';
    WHEN '0 0 * * *' THEN next_time := date_trunc('day', from_time) + INTERVAL '1 day';
    WHEN '0 0 * * 0' THEN next_time := date_trunc('week', from_time) + INTERVAL '1 week';
    ELSE next_time := from_time + INTERVAL '1 hour'; -- default fallback
  END CASE;
  
  RETURN next_time;
END;
$function$;

-- ============================================================================
-- 2. Criar RLS Policies Explícitas (Opção 2: Acesso Super Admin)
-- ============================================================================

-- 2.1 Policies para failed_login_attempts
-- Super admins podem visualizar (para debugging)
CREATE POLICY "Super admins can view failed login attempts"
ON public.failed_login_attempts
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Bloquear todas as modificações para usuários (WITH CHECK para INSERT/UPDATE/DELETE)
CREATE POLICY "Block all modifications to failed_login_attempts"
ON public.failed_login_attempts
FOR INSERT
WITH CHECK (false);

CREATE POLICY "Block updates to failed_login_attempts"
ON public.failed_login_attempts
FOR UPDATE
WITH CHECK (false);

CREATE POLICY "Block deletes to failed_login_attempts"
ON public.failed_login_attempts
FOR DELETE
USING (false);

-- 2.2 Policies para ip_blocklist
-- Super admins podem visualizar
CREATE POLICY "Super admins can view ip blocklist"
ON public.ip_blocklist
FOR SELECT
USING (public.is_super_admin(auth.uid()));

-- Super admins podem desbloquear IPs (DELETE)
CREATE POLICY "Super admins can unblock IPs"
ON public.ip_blocklist
FOR DELETE
USING (public.is_super_admin(auth.uid()));

-- Bloquear INSERT e UPDATE para todos (WITH CHECK)
CREATE POLICY "Block inserts to ip_blocklist"
ON public.ip_blocklist
FOR INSERT
WITH CHECK (false);

CREATE POLICY "Block updates to ip_blocklist"
ON public.ip_blocklist
FOR UPDATE
WITH CHECK (false);

-- ============================================================================
-- COMENTÁRIOS E DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON POLICY "Super admins can view failed login attempts" ON public.failed_login_attempts IS 
  'Permite que super admins visualizem tentativas de login falhadas para debugging e análise de segurança';

COMMENT ON POLICY "Block all modifications to failed_login_attempts" ON public.failed_login_attempts IS 
  'Bloqueia INSERT por usuários - apenas edge functions (SERVICE_ROLE_KEY) podem inserir registros';

COMMENT ON POLICY "Super admins can view ip blocklist" ON public.ip_blocklist IS 
  'Permite que super admins visualizem IPs bloqueados para monitoramento de segurança';

COMMENT ON POLICY "Super admins can unblock IPs" ON public.ip_blocklist IS 
  'Permite que super admins desbloqueiem IPs manualmente quando necessário';

COMMENT ON POLICY "Block inserts to ip_blocklist" ON public.ip_blocklist IS 
  'Bloqueia INSERT por usuários - apenas edge functions (SERVICE_ROLE_KEY) podem bloquear IPs';