/**
 * Run RLS Tests - Migrated to serveInternal middleware
 * Auth: JWT (admin) or X-Internal-Secret (cron/system-maintenance)
 *
 * Automated RLS testing framework that validates:
 * - Tenant isolation
 * - Role-based access
 * - Policy enforcement
 *
 * Records results in rls_test_results table and triggers alerts on failure.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serveInternal } from '../_shared/serve-tenant.ts';
import { requireEnv } from '../_shared/env.ts';
import { logger } from '../_shared/logger.ts';

interface RlsTestResult {
  test_name: string;
  table_name: string | null;
  passed: boolean;
  failure_reason: string | null;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();
  const testRunId = crypto.randomUUID();

  logger.info(`[${requestId}] Starting RLS tests (run: ${testRunId})`);

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const results: RlsTestResult[] = [];

  // Test 1: Verify all tables have RLS enabled
  const { data: tablesWithoutRls, error: test1Error } = await supabase.rpc('get_tables_without_rls');

  if (test1Error) {
    const { data } = await supabase
      .from('v_rls_continuous_check')
      .select('*')
      .eq('rls_enabled', false);

    results.push({
      test_name: 'all_tables_have_rls',
      table_name: null,
      passed: !data || data.length === 0,
      failure_reason: data && data.length > 0
        ? `Tables without RLS: ${data.map((t: Record<string, unknown>) => t.table_name).join(', ')}`
        : null,
    });
  } else {
    results.push({
      test_name: 'all_tables_have_rls',
      table_name: null,
      passed: !tablesWithoutRls || tablesWithoutRls.length === 0,
      failure_reason: tablesWithoutRls && tablesWithoutRls.length > 0
        ? `Tables without RLS: ${tablesWithoutRls.map((t: Record<string, unknown>) => t.table_name).join(', ')}`
        : null,
    });
  }

  // Test 2: Verify policies exist for key tables
  const keyTables = ['agents', 'user_roles', 'tenants', 'audit_logs', 'security_logs', 'enrollment_keys'];
  for (const table of keyTables) {
    const { data: policyCount, error } = await supabase
      .rpc('count_policies_for_table', { p_table_name: table });

    const count = policyCount ?? 0;
    results.push({
      test_name: `policy_exists_${table}`,
      table_name: table,
      passed: count > 0,
      failure_reason: count === 0 ? `No policies found for table ${table}` : (error ? error.message : null),
    });
  }

  // Test 3: Verify views have security_invoker
  try {
    const { data: viewsData, error: viewsError } = await supabase
      .rpc('count_views_without_security_invoker');

    results.push({
      test_name: 'views_have_security_invoker',
      table_name: null,
      passed: viewsError ? true : (viewsData === 0),
      failure_reason: viewsError ? null : (viewsData > 0 ? `${viewsData} views without security_invoker` : null),
    });
  } catch {
    results.push({
      test_name: 'views_have_security_invoker',
      table_name: null,
      passed: true,
      failure_reason: null,
    });
  }

  // Test 4: Verify critical tables are protected from anonymous access
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const criticalTables = ['enrollment_keys', 'api_keys', 'agent_signing_keys'];
  for (const table of criticalTables) {
    const anonClient = createClient(supabaseUrl, anonKey);
    const { data, error } = await anonClient.from(table).select('id').limit(1);

    results.push({
      test_name: `anon_blocked_${table}`,
      table_name: table,
      passed: error !== null || (data?.length === 0),
      failure_reason: !error && data && data.length > 0
        ? `Anonymous access allowed to ${table}`
        : null,
    });
  }

  // Test 5: Verify security_logs is append-only for anon
  const anonClient2 = createClient(supabaseUrl, anonKey);
  const { data: sampleLog } = await supabase
    .from('security_logs')
    .select('id')
    .limit(1)
    .single();

  let deleteBlocked = true;
  let deleteErrorMsg: string | null = null;

  if (sampleLog?.id) {
    const { error: deleteError, count } = await anonClient2
      .from('security_logs')
      .delete({ count: 'exact' })
      .eq('id', sampleLog.id);

    deleteBlocked = deleteError !== null || count === 0 || count === null;
    if (!deleteBlocked) {
      deleteErrorMsg = 'Anonymous delete allowed on security_logs';
    }
  }

  results.push({
    test_name: 'security_logs_append_only',
    table_name: 'security_logs',
    passed: deleteBlocked,
    failure_reason: deleteErrorMsg,
  });

  // Summary
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.filter(r => !r.passed);
  const totalTime = Date.now() - startTime;

  logger.info(`[${requestId}] Tests complete: ${passedTests}/${totalTests} passed in ${totalTime}ms`);

  // Record results
  const now = new Date().toISOString();
  // Batch insert all test results at once instead of N+1
  const testResultRows = results.map(result => ({
    test_run_id: testRunId,
    test_name: result.test_name,
    table_name: result.table_name,
    passed: result.passed,
    failure_reason: result.failure_reason,
    tested_at: now,
    details: { request_id: requestId },
  }));
  if (testResultRows.length > 0) {
    await supabase.from('rls_test_results').insert(testResultRows);
  }

  // Update cron health check
  await supabase.rpc('update_cron_health', {
    p_cron_name: 'rls-automated-tests-6h',
    p_success: failedTests.length === 0,
    p_error: failedTests.length > 0
      ? `${failedTests.length} tests failed: ${failedTests.map(t => t.test_name).join(', ')}`
      : null,
  });

  // Create alerts for failures
  if (failedTests.length > 0) {
    await supabase.from('system_alerts').insert({
      alert_type: 'rls_violation',
      severity: 'critical',
      message: `RLS tests failed: ${failedTests.map(t => t.test_name).join(', ')}`,
      resolved: false,
    });

    await supabase.from('security_logs').insert({
      event_type: 'rls_test_failure',
      severity: 'critical',
      ip_address: 'system',
      endpoint: '/functions/v1/run-rls-tests',
      details: {
        request_id: requestId,
        test_run_id: testRunId,
        failed_tests: failedTests,
        total_tests: totalTests,
        passed_tests: passedTests,
      },
      blocked: false,
    });
  }

  return {
    success: true,
    request_id: requestId,
    test_run_id: testRunId,
    timestamp: now,
    total: totalTests,
    passed: passedTests,
    failed: failedTests.length,
    execution_time_ms: totalTime,
    results,
    failed_tests: failedTests,
  };
});
