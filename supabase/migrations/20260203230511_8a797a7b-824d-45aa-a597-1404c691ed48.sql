
-- ============================================================================
-- CORRECAO: v_security_invariants - Evitar falso positivo na verificacao INV-004
-- A query de verificacao continha a string 'hmac_secret' que era detectada como exposicao
-- Solucao: Usar POSITION/STRPOS para evitar literal match
-- ============================================================================

DROP VIEW IF EXISTS v_security_invariants;

CREATE OR REPLACE VIEW v_security_invariants 
WITH (security_invoker = on) AS
SELECT 
  -- Timestamp do snapshot
  NOW() AS snapshot_at,
  
  -- ========================================================================
  -- INV-001: RLS (Row Level Security) Habilitado
  -- ========================================================================
  (
    SELECT COUNT(*) 
    FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE c.relrowsecurity = true 
      AND n.nspname = 'public'
      AND c.relkind = 'r'
  ) AS inv001_tables_with_rls,
  
  (
    SELECT COUNT(*) 
    FROM pg_class c 
    JOIN pg_namespace n ON n.oid = c.relnamespace 
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
  ) AS inv001_total_tables,
  
  (
    SELECT COUNT(DISTINCT tablename)
    FROM pg_policies 
    WHERE schemaname = 'public'
  ) AS inv001_tables_with_policies,
  
  -- ========================================================================
  -- INV-002: Autenticacao HMAC Funcionando (PROVA EMPIRICA)
  -- ========================================================================
  (
    SELECT COUNT(*) 
    FROM hmac_signatures 
    WHERE used_at > NOW() - INTERVAL '24 hours'
  ) AS inv002_signatures_24h,
  
  (
    SELECT COUNT(*) 
    FROM hmac_signatures 
    WHERE used_at > NOW() - INTERVAL '1 hour'
  ) AS inv002_signatures_1h,
  
  (
    SELECT COUNT(DISTINCT agent_name)
    FROM hmac_signatures 
    WHERE used_at > NOW() - INTERVAL '24 hours'
  ) AS inv002_unique_agents_24h,
  
  (
    SELECT COALESCE(
      (SELECT used_at FROM hmac_signatures ORDER BY used_at DESC LIMIT 1),
      '1970-01-01'::timestamptz
    )
  ) AS inv002_last_verification,
  
  -- ========================================================================
  -- INV-003: Isolamento Multi-Tenant (PROVA EMPIRICA)
  -- ========================================================================
  (
    SELECT COUNT(DISTINCT tenant_id) 
    FROM agents 
    WHERE archived_at IS NULL
  ) AS inv003_active_tenants,
  
  (
    SELECT COUNT(*) 
    FROM rls_test_results 
    WHERE passed = true 
      AND tested_at > NOW() - INTERVAL '7 days'
  ) AS inv003_rls_tests_passed_7d,
  
  (
    SELECT COUNT(*) 
    FROM rls_test_results 
    WHERE passed = false 
      AND tested_at > NOW() - INTERVAL '7 days'
  ) AS inv003_rls_tests_failed_7d,
  
  -- ========================================================================
  -- INV-004: Secrets Protegidos (VERIFICACAO ESTATICA)
  -- Usa POSITION para evitar literal match na propria view
  -- ========================================================================
  (
    SELECT COUNT(*) = 0
    FROM pg_views v
    WHERE v.schemaname = 'public'
      AND v.viewname != 'v_security_invariants'
      AND (
        POSITION('hmac' || '_secret' IN v.definition) > 0
        OR POSITION('pass' || 'word' IN v.definition) > 0
      )
  ) AS inv004_no_secrets_in_views,
  
  (
    SELECT COUNT(*)
    FROM pg_views v
    WHERE v.schemaname = 'public'
      AND v.viewname IN ('agents_public', 'agents_safe', 'active_agents')
      AND POSITION('hmac' || '_secret' IN v.definition) = 0
  ) AS inv004_safe_agent_views,
  
  -- ========================================================================
  -- INV-005: Auditoria Habilitada (PROVA EMPIRICA)
  -- ========================================================================
  (
    SELECT COUNT(*) 
    FROM audit_logs 
    WHERE created_at > NOW() - INTERVAL '24 hours'
  ) AS inv005_audit_entries_24h,
  
  (
    SELECT COUNT(*) 
    FROM audit_logs 
    WHERE created_at > NOW() - INTERVAL '1 hour'
  ) AS inv005_audit_entries_1h,
  
  (
    SELECT COUNT(DISTINCT action)
    FROM audit_logs 
    WHERE created_at > NOW() - INTERVAL '24 hours'
  ) AS inv005_unique_actions_24h,
  
  (
    SELECT COUNT(*)
    FROM agent_evidence_logs 
    WHERE created_at > NOW() - INTERVAL '24 hours'
  ) AS inv005_evidence_logs_24h,
  
  -- ========================================================================
  -- INV-006: Privilegio Minimo (VERIFICACAO ESTATICA)
  -- ========================================================================
  (
    SELECT COUNT(*) = 0
    FROM information_schema.role_table_grants 
    WHERE grantee = 'anon'
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
      AND table_schema = 'public'
  ) AS inv006_no_anon_write,
  
  (
    SELECT COUNT(*)
    FROM pg_policies 
    WHERE schemaname = 'public'
      AND roles::text LIKE '%service_role%'
  ) AS inv006_service_role_policies,
  
  -- ========================================================================
  -- METRICAS DE SAUDE OPERACIONAL
  -- ========================================================================
  (
    SELECT COUNT(*) 
    FROM agents 
    WHERE archived_at IS NULL
      AND last_heartbeat > NOW() - INTERVAL '30 minutes'
  ) AS health_active_agents,
  
  (
    SELECT COUNT(*) 
    FROM ai_actions 
    WHERE status = 'pending' 
      AND created_at > NOW() - INTERVAL '7 days'
  ) AS health_pending_actions,
  
  (
    SELECT COUNT(*) 
    FROM ai_actions 
    WHERE status = 'executed' 
      AND executed_at > NOW() - INTERVAL '24 hours'
  ) AS health_executed_actions_24h,
  
  (
    SELECT COUNT(*) 
    FROM jobs 
    WHERE status = 'done' 
      AND completed_at > NOW() - INTERVAL '24 hours'
  ) AS health_jobs_completed_24h;

-- Comentario ADR
COMMENT ON VIEW v_security_invariants IS 
'ADR-INV: View canonica para verificacao empirica de invariantes de seguranca (INV-001 a INV-006).
Metodologia Nullmann: Prova de existencia real, nao apenas configuracao teorica.
- INV-001: RLS habilitado em tabelas publicas
- INV-002: HMAC funcionando (assinaturas recentes)
- INV-003: Isolamento multi-tenant (testes RLS passando)
- INV-004: Secrets protegidos (nao expostos em views)
- INV-005: Auditoria habilitada (logs recentes)
- INV-006: Privilegio minimo (sem escrita anon)
security_invoker=on para garantir RLS do caller.';

-- Controle de acesso
REVOKE ALL ON v_security_invariants FROM PUBLIC;
REVOKE ALL ON v_security_invariants FROM anon;
GRANT SELECT ON v_security_invariants TO authenticated;
GRANT SELECT ON v_security_invariants TO service_role;
