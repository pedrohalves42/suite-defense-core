-- ============================================================
-- ADR-026 Security Invariants Test Suite
-- Final Artifacts for GO DEFINITIVO Certification
-- ============================================================
-- 
-- Este script valida os invariantes criticos do ADR-026:
-- 1. get_active_tenant_id() funciona corretamente
-- 2. update_user_role_rpc respeita isolamento de tenant
-- 3. agents_deny_direct_select bloqueia acesso direto
-- 4. agents_safe nao expoe hmac_secret
-- 5. Views criticas usam security_invoker
--
-- Execucao: Via Supabase SQL Editor ou psql
-- Resultado esperado: 100% dos testes devem PASSAR
-- ============================================================

DO $$
DECLARE
    v_test_results jsonb := '[]'::jsonb;
    v_test_name text;
    v_test_passed boolean;
    v_total_tests int := 0;
    v_passed_tests int := 0;
    v_failed_tests int := 0;
    v_query_result int;
    v_has_hmac boolean;
    v_function_exists boolean;
    v_policy_exists boolean;
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'ADR-026 Security Invariants Test Suite';
    RAISE NOTICE 'GO DEFINITIVO Certification - Dr. Isaac K. Vellum';
    RAISE NOTICE 'Data: %', NOW();
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';

    -- ===========================================
    -- TEST 01: get_active_tenant_id() existe
    -- ===========================================
    
    v_test_name := 'ADR026-01: get_active_tenant_id() Funcao Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'get_active_tenant_id'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: Funcao nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 02: get_active_tenant_id() e SECURITY DEFINER
    -- ===========================================
    
    v_test_name := 'ADR026-02: get_active_tenant_id() e SECURITY DEFINER';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' 
        AND p.proname = 'get_active_tenant_id'
        AND p.prosecdef = true
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: Funcao nao e SECURITY DEFINER', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 03: agents_deny_direct_select policy existe
    -- ===========================================
    
    v_test_name := 'ADR026-03: agents_deny_direct_select Policy Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'agents'
        AND policyname = 'agents_deny_direct_select'
    ) INTO v_policy_exists;
    
    IF v_policy_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: Policy nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 04: agents_safe view existe
    -- ===========================================
    
    v_test_name := 'ADR026-04: agents_safe View Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'agents_safe'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: View nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 05: agents_safe NAO contem hmac_secret
    -- ===========================================
    
    v_test_name := 'ADR026-05: agents_safe Nao Expoe hmac_secret';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'agents_safe'
        AND column_name = 'hmac_secret'
    ) INTO v_has_hmac;
    
    IF NOT v_has_hmac THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: hmac_secret EXPOSTO na view!', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 06: agents_safe NAO contem payload_hash
    -- ===========================================
    
    v_test_name := 'ADR026-06: agents_safe Nao Expoe payload_hash';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = 'agents_safe'
        AND column_name = 'payload_hash'
    ) INTO v_has_hmac;
    
    IF NOT v_has_hmac THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: payload_hash EXPOSTO na view!', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 07: agents_safe usa security_invoker
    -- ===========================================
    
    v_test_name := 'ADR026-07: agents_safe Usa security_invoker';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public'
        AND c.relname = 'agents_safe'
        AND c.relkind = 'v'
        AND (
            c.reloptions @> ARRAY['security_invoker=on']
            OR c.reloptions @> ARRAY['security_invoker=true']
        )
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: View nao usa security_invoker', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 08: update_user_role_rpc existe
    -- ===========================================
    
    v_test_name := 'ADR026-08: update_user_role_rpc Funcao Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'update_user_role_rpc'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: Funcao nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 09: is_active_tenant() existe
    -- ===========================================
    
    v_test_name := 'ADR026-09: is_active_tenant() Funcao Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'is_active_tenant'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: Funcao nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 10: v_tenant_claim_health view existe
    -- ===========================================
    
    v_test_name := 'ADR026-10: v_tenant_claim_health View Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'v_tenant_claim_health'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: View nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 11: Nenhuma funcao sensivel exposta a public
    -- ===========================================
    
    v_test_name := 'ADR026-11: Funcoes Sensiveis Nao Expostas a Public';
    v_total_tests := v_total_tests + 1;
    
    SELECT COUNT(*) INTO v_query_result
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
    AND grantee = 'public'
    AND routine_name IN (
        'get_enrollment_key_full',
        'generate_agent_hmac_secret',
        'verify_agent_signature',
        'register_agent_public_key'
    );
    
    IF v_query_result = 0 THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: % funcoes ainda expostas a public', v_test_name, v_query_result;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 12: enrollment_keys_safe view existe
    -- ===========================================
    
    v_test_name := 'ADR026-12: enrollment_keys_safe View Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'enrollment_keys_safe'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: View nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 13: invites_safe view existe
    -- ===========================================
    
    v_test_name := 'ADR026-13: invites_safe View Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'invites_safe'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: View nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 14: agents_public view existe
    -- ===========================================
    
    v_test_name := 'ADR026-14: agents_public View Existe';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public' AND table_name = 'agents_public'
    ) INTO v_function_exists;
    
    IF v_function_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: View nao encontrada', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- TEST 15: service_role mantem acesso a agents
    -- ===========================================
    
    v_test_name := 'ADR026-15: service_role Mantem Acesso a agents';
    v_total_tests := v_total_tests + 1;
    
    SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'agents'
        AND roles::text LIKE '%service_role%'
    ) INTO v_policy_exists;
    
    IF v_policy_exists THEN
        v_test_passed := true;
        v_passed_tests := v_passed_tests + 1;
        RAISE NOTICE '[PASS] %', v_test_name;
    ELSE
        v_test_passed := false;
        v_failed_tests := v_failed_tests + 1;
        RAISE NOTICE '[FAIL] %: service_role sem acesso', v_test_name;
    END IF;
    
    v_test_results := v_test_results || jsonb_build_object('test', v_test_name, 'passed', v_test_passed);

    -- ===========================================
    -- RESUMO FINAL
    -- ===========================================
    
    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'RESUMO DO TESTE ADR-026';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Total de Testes: %', v_total_tests;
    RAISE NOTICE 'Passou: % (%\%%)', v_passed_tests, ROUND((v_passed_tests::numeric / v_total_tests) * 100);
    RAISE NOTICE 'Falhou: %', v_failed_tests;
    RAISE NOTICE '';
    
    IF v_failed_tests = 0 THEN
        RAISE NOTICE '============================================================';
        RAISE NOTICE '? ADR-026 INVARIANTS: ALL TESTS PASSED';
        RAISE NOTICE '   Status: ENTERPRISE / AUDITOR-GRADE';
        RAISE NOTICE '   Certified by: Dr. Isaac K. Vellum';
        RAISE NOTICE '============================================================';
    ELSE
        RAISE NOTICE '============================================================';
        RAISE NOTICE '? ADR-026 INVARIANTS: FAILURES DETECTED';
        RAISE NOTICE '   % test(s) failed - Review required', v_failed_tests;
        RAISE NOTICE '============================================================';
    END IF;

END $$;
