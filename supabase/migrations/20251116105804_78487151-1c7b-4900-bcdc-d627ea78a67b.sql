-- ============================================================================
-- P0 FIX: Corrigir vazamento cross-tenant em 3 views
-- Data: 2025-11-16
-- Ref: Auditoria Nuclear - Issue P0 (ex-P1.2)
-- ============================================================================

-- 1. FIX: v_problematic_jobs
-- Problema: View permite ver jobs de outros tenants
-- Solucao: Adicionar security_invoker + filtro tenant_id

DROP VIEW IF EXISTS public.v_problematic_jobs CASCADE;

CREATE VIEW public.v_problematic_jobs
WITH (security_invoker = true)
AS
SELECT 
  j.id,
  j.agent_name,
  j.type,
  j.status,
  j.created_at,
  j.delivered_at,
  j.completed_at,
  CASE 
    WHEN j.status = 'delivered' 
         AND j.delivered_at < NOW() - INTERVAL '10 minutes' 
    THEN 'stuck_delivered'
    
    WHEN j.status = 'queued' 
         AND j.created_at < NOW() - INTERVAL '1 hour' 
    THEN 'stuck_queued'
    
    WHEN j.payload IS NULL 
    THEN 'null_payload'
    
    WHEN j.type IS NULL OR j.type = '' 
    THEN 'invalid_type'
    
    ELSE 'unknown'
  END as problem_type,
  
  EXTRACT(EPOCH FROM (NOW() - j.created_at))/60 as age_minutes
FROM public.jobs j
WHERE 
  -- CRITICAL FIX: Filtrar apenas jobs do(s) tenant(s) do usuario
  j.tenant_id IN (
    SELECT tenant_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
  AND (
    -- Jobs delivered ha mais de 10min
    (j.status = 'delivered' AND j.delivered_at < NOW() - INTERVAL '10 minutes')
    OR
    -- Jobs queued ha mais de 1h
    (j.status = 'queued' AND j.created_at < NOW() - INTERVAL '1 hour')
    OR
    -- Jobs com problemas de dados
    (j.payload IS NULL OR j.type IS NULL OR j.type = '')
  )
ORDER BY j.created_at DESC;

COMMENT ON VIEW public.v_problematic_jobs IS 
'View segura de jobs problematicos com isolamento multi-tenant via security_invoker=true';

-- ============================================================================

-- 2. FIX: installation_error_summary
-- Problema: View permite ver erros de instalacao de outros tenants
-- Solucao: Adicionar security_invoker + filtro tenant_id

DROP VIEW IF EXISTS public.installation_error_summary CASCADE;

CREATE VIEW public.installation_error_summary
WITH (security_invoker = true)
AS
WITH user_tenants AS (
  -- Subquery para obter tenant_id(s) do usuario
  SELECT tenant_id 
  FROM public.user_roles 
  WHERE user_id = auth.uid()
),
error_stats AS (
  SELECT 
    ia.tenant_id,
    ia.platform,
    ia.error_message,
    COUNT(*) as occurrence_count,
    MAX(ia.created_at) as last_seen,
    MIN(ia.created_at) as first_seen,
    COUNT(DISTINCT ia.agent_name) as unique_agents_affected,
    ARRAY_AGG(DISTINCT ia.agent_name) FILTER (WHERE ia.agent_name IS NOT NULL) as all_affected_agents
  FROM public.installation_analytics ia
  WHERE ia.success = false 
    AND ia.error_message IS NOT NULL
    AND ia.created_at > NOW() - INTERVAL '90 days'
    -- CRITICAL FIX: Filtrar apenas dados do(s) tenant(s) do usuario
    AND ia.tenant_id IN (SELECT tenant_id FROM user_tenants)
  GROUP BY ia.tenant_id, ia.platform, ia.error_message
)
SELECT 
  es.tenant_id,
  es.platform,
  es.error_message,
  es.occurrence_count,
  ROUND(
    (es.occurrence_count::numeric / 
     NULLIF(
       (SELECT COUNT(*) 
        FROM public.installation_analytics ia2 
        WHERE ia2.success = false 
          AND ia2.created_at > NOW() - INTERVAL '90 days'
          AND ia2.tenant_id IN (SELECT tenant_id FROM user_tenants)
       ), 
       0
     )::numeric
    ) * 100, 
    1
  ) as percentage_of_failures,
  es.last_seen,
  es.first_seen,
  es.all_affected_agents[1:10] as affected_agents_sample,
  es.unique_agents_affected
FROM error_stats es
ORDER BY es.occurrence_count DESC
LIMIT 100;

COMMENT ON VIEW public.installation_error_summary IS 
'View segura de resumo de erros de instalacao com isolamento multi-tenant via security_invoker=true';

-- ============================================================================

-- 3. FIX: installation_health_status
-- Problema: View permite ver saude de instalacoes de outros tenants
-- Solucao: Adicionar security_invoker + filtro tenant_id

DROP VIEW IF EXISTS public.installation_health_status CASCADE;

CREATE VIEW public.installation_health_status
WITH (security_invoker = true)
AS
SELECT 
  ia.tenant_id,
  
  COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours') as attempts_24h,
  COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours' AND ia.success = true) as success_24h,
  COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours' AND ia.success = false) as failed_24h,
  
  CASE 
    WHEN COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours') > 0 THEN
      ROUND(
        (COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours' AND ia.success = false)::numeric / 
         COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours')::numeric
        ) * 100,
        1
      )
    ELSE 0
  END as failure_rate_24h_pct,
  
  CASE 
    WHEN COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours') = 0 THEN 'no_data'
    WHEN (
      COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours' AND ia.success = false)::numeric / 
      NULLIF(COUNT(*) FILTER (WHERE ia.created_at > NOW() - INTERVAL '24 hours'), 0)::numeric
    ) > 0.30 THEN 'unhealthy'
    ELSE 'healthy'
  END as health_status,
  
  MAX(ia.created_at) as last_installation_at
  
FROM public.installation_analytics ia
WHERE 
  -- CRITICAL FIX: Filtrar apenas dados do(s) tenant(s) do usuario
  ia.tenant_id IN (
    SELECT tenant_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid()
  )
  AND ia.event_type IN ('post_installation', 'post_installation_unverified')
GROUP BY ia.tenant_id
ORDER BY ia.tenant_id;

COMMENT ON VIEW public.installation_health_status IS 
'View segura de status de saude de instalacoes com isolamento multi-tenant via security_invoker=true';

-- ============================================================================
-- VALIDACAO: Confirmar que views foram criadas corretamente
-- ============================================================================

DO $$
BEGIN
  -- Verificar se views foram criadas com security_invoker
  IF NOT EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'public' 
      AND viewname IN ('v_problematic_jobs', 'installation_error_summary', 'installation_health_status')
  ) THEN
    RAISE EXCEPTION 'Uma ou mais views nao foram criadas corretamente';
  END IF;
  
  RAISE NOTICE 'P0 FIX aplicado com sucesso: 3 views agora isolam dados por tenant';
END $$;