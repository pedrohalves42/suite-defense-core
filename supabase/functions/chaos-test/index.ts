import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChaosTestResult {
  test_name: string;
  description: string;
  expected_behavior: string;
  actual_result: 'PASS' | 'FAIL' | 'ERROR';
  error_message?: string;
  execution_time_ms: number;
}

interface ChaosTestReport {
  timestamp: string;
  total_tests: number;
  passed: number;
  failed: number;
  errors: number;
  global_result: 'ALL_PASS' | 'SOME_FAILED' | 'CRITICAL_FAILURE';
  tests: ChaosTestResult[];
  invariants_validated: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const results: ChaosTestResult[] = [];

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[chaos-test] Starting Zero Trust Chaos Tests...');

    // ========================================
    // TEST 1: INV-007 - Illegal State Transition (queued → completed)
    // ========================================
    const test1Start = Date.now();
    try {
      // Create test job
      const { data: testJob, error: createError } = await supabase
        .from('jobs')
        .insert({
          agent_name: 'chaos-test-agent',
          tenant_id: '00000000-0000-0000-0000-000000000000', // Will be blocked by RLS, we use service role
          type: 'chaos_test',
          status: 'queued',
          approved: true
        })
        .select()
        .single();

      if (createError) {
        // Expected if no valid tenant - try with first available tenant
        const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
        
        if (!tenant) {
          results.push({
            test_name: 'INV-007: Illegal Transition queued→completed',
            description: 'Attempt to skip delivered state',
            expected_behavior: 'BLOCKED by trigger',
            actual_result: 'ERROR',
            error_message: 'No tenant available for test',
            execution_time_ms: Date.now() - test1Start
          });
        } else {
          // Create job with valid tenant
          const { data: job, error: insertErr } = await supabase
            .from('jobs')
            .insert({
              agent_name: 'chaos-test-agent',
              tenant_id: tenant.id,
              type: 'chaos_test',
              status: 'queued',
              approved: true
            })
            .select()
            .single();

          if (insertErr) {
            results.push({
              test_name: 'INV-007: Illegal Transition queued→completed',
              description: 'Attempt to skip delivered state',
              expected_behavior: 'BLOCKED by trigger',
              actual_result: 'ERROR',
              error_message: insertErr.message,
              execution_time_ms: Date.now() - test1Start
            });
          } else {
            // Try illegal transition
            const { error: updateError } = await supabase
              .from('jobs')
              .update({ status: 'completed', output: '{"test": true}' })
              .eq('id', job.id);

            if (updateError && updateError.message.includes('ILLEGAL_STATE_TRANSITION')) {
              results.push({
                test_name: 'INV-007: Illegal Transition queued→completed',
                description: 'Attempt to skip delivered state',
                expected_behavior: 'BLOCKED by trigger',
                actual_result: 'PASS',
                execution_time_ms: Date.now() - test1Start
              });
            } else {
              results.push({
                test_name: 'INV-007: Illegal Transition queued→completed',
                description: 'Attempt to skip delivered state',
                expected_behavior: 'BLOCKED by trigger',
                actual_result: 'FAIL',
                error_message: updateError?.message || 'Transition was allowed (should be blocked)',
                execution_time_ms: Date.now() - test1Start
              });
            }

            // Cleanup
            await supabase.from('jobs').delete().eq('id', job.id);
          }
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        test_name: 'INV-007: Illegal Transition queued→completed',
        description: 'Attempt to skip delivered state',
        expected_behavior: 'BLOCKED by trigger',
        actual_result: 'ERROR',
        error_message: errorMessage,
        execution_time_ms: Date.now() - test1Start
      });
    }

    // ========================================
    // TEST 2: INV-007 - Illegal State Transition (failed → completed)
    // ========================================
    const test2Start = Date.now();
    try {
      const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
      
      if (tenant) {
        // Create job and move to delivered, then failed
        const { data: job } = await supabase
          .from('jobs')
          .insert({
            agent_name: 'chaos-test-agent-2',
            tenant_id: tenant.id,
            type: 'chaos_test',
            status: 'queued',
            approved: true
          })
          .select()
          .single();

        if (job) {
          // Move to delivered
          await supabase.from('jobs').update({ status: 'delivered' }).eq('id', job.id);
          
          // Move to failed (with error_message)
          await supabase.from('jobs')
            .update({ status: 'failed', error_message: 'Chaos test intentional failure' })
            .eq('id', job.id);

          // Try illegal transition from terminal state
          const { error: updateError } = await supabase
            .from('jobs')
            .update({ status: 'completed', output: '{"test": true}' })
            .eq('id', job.id);

          if (updateError && updateError.message.includes('ILLEGAL_STATE_TRANSITION')) {
            results.push({
              test_name: 'INV-007: Terminal State Exit (failed→completed)',
              description: 'Attempt to exit terminal failed state',
              expected_behavior: 'BLOCKED by trigger',
              actual_result: 'PASS',
              execution_time_ms: Date.now() - test2Start
            });
          } else {
            results.push({
              test_name: 'INV-007: Terminal State Exit (failed→completed)',
              description: 'Attempt to exit terminal failed state',
              expected_behavior: 'BLOCKED by trigger',
              actual_result: 'FAIL',
              error_message: updateError?.message || 'Transition was allowed',
              execution_time_ms: Date.now() - test2Start
            });
          }

          // Cleanup
          await supabase.from('jobs').delete().eq('id', job.id);
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        test_name: 'INV-007: Terminal State Exit (failed→completed)',
        description: 'Attempt to exit terminal failed state',
        expected_behavior: 'BLOCKED by trigger',
        actual_result: 'ERROR',
        error_message: errorMessage,
        execution_time_ms: Date.now() - test2Start
      });
    }

    // ========================================
    // TEST 3: INV-008 - Completed without Output
    // ========================================
    const test3Start = Date.now();
    try {
      const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
      
      if (tenant) {
        const { data: job } = await supabase
          .from('jobs')
          .insert({
            agent_name: 'chaos-test-agent-3',
            tenant_id: tenant.id,
            type: 'chaos_test',
            status: 'queued',
            approved: true
          })
          .select()
          .single();

        if (job) {
          // Move to delivered
          await supabase.from('jobs').update({ status: 'delivered' }).eq('id', job.id);

          // Try to complete WITHOUT output
          const { error: updateError } = await supabase
            .from('jobs')
            .update({ status: 'completed' }) // No output!
            .eq('id', job.id);

          if (updateError && updateError.message.includes('JOB_COMPLETED_WITHOUT_SIDE_EFFECTS')) {
            results.push({
              test_name: 'INV-008: Completed without Output',
              description: 'Attempt to mark job completed without producing output',
              expected_behavior: 'BLOCKED by trigger',
              actual_result: 'PASS',
              execution_time_ms: Date.now() - test3Start
            });
          } else {
            results.push({
              test_name: 'INV-008: Completed without Output',
              description: 'Attempt to mark job completed without producing output',
              expected_behavior: 'BLOCKED by trigger',
              actual_result: 'FAIL',
              error_message: updateError?.message || 'Job was completed without output',
              execution_time_ms: Date.now() - test3Start
            });
          }

          // Cleanup
          await supabase.from('jobs').delete().eq('id', job.id);
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        test_name: 'INV-008: Completed without Output',
        description: 'Attempt to mark job completed without producing output',
        expected_behavior: 'BLOCKED by trigger',
        actual_result: 'ERROR',
        error_message: errorMessage,
        execution_time_ms: Date.now() - test3Start
      });
    }

    // ========================================
    // TEST 4: INV-009 - Failed without Error Message
    // ========================================
    const test4Start = Date.now();
    try {
      const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single();
      
      if (tenant) {
        const { data: job } = await supabase
          .from('jobs')
          .insert({
            agent_name: 'chaos-test-agent-4',
            tenant_id: tenant.id,
            type: 'chaos_test',
            status: 'queued',
            approved: true
          })
          .select()
          .single();

        if (job) {
          // Move to delivered
          await supabase.from('jobs').update({ status: 'delivered' }).eq('id', job.id);

          // Try to fail WITHOUT error_message
          const { error: updateError } = await supabase
            .from('jobs')
            .update({ status: 'failed' }) // No error_message!
            .eq('id', job.id);

          if (updateError && updateError.message.includes('FAILED_JOB_REQUIRES_ERROR_MESSAGE')) {
            results.push({
              test_name: 'INV-009: Failed without Error Message',
              description: 'Attempt to mark job failed without error explanation',
              expected_behavior: 'BLOCKED by trigger',
              actual_result: 'PASS',
              execution_time_ms: Date.now() - test4Start
            });
          } else {
            results.push({
              test_name: 'INV-009: Failed without Error Message',
              description: 'Attempt to mark job failed without error explanation',
              expected_behavior: 'BLOCKED by trigger',
              actual_result: 'FAIL',
              error_message: updateError?.message || 'Job was failed without error_message',
              execution_time_ms: Date.now() - test4Start
            });
          }

          // Cleanup
          await supabase.from('jobs').delete().eq('id', job.id);
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        test_name: 'INV-009: Failed without Error Message',
        description: 'Attempt to mark job failed without error explanation',
        expected_behavior: 'BLOCKED by trigger',
        actual_result: 'ERROR',
        error_message: errorMessage,
        execution_time_ms: Date.now() - test4Start
      });
    }

    // ========================================
    // TEST 5: Validate Integrity Score View
    // ========================================
    const test5Start = Date.now();
    try {
      const { data: score, error: scoreError } = await supabase
        .from('v_integrity_score')
        .select('*')
        .maybeSingle();

      if (scoreError) {
        results.push({
          test_name: 'Integrity Score View',
          description: 'Validate v_integrity_score returns valid data',
          expected_behavior: 'View accessible and returns scores',
          actual_result: 'ERROR',
          error_message: scoreError.message,
          execution_time_ms: Date.now() - test5Start
        });
      } else {
        const hasRequiredFields = score && 
          'global_integrity_score' in score &&
          'supply_chain_score' in score &&
          'job_integrity_score' in score &&
          'failed_jobs_score' in score;

        results.push({
          test_name: 'Integrity Score View',
          description: 'Validate v_integrity_score returns valid data',
          expected_behavior: 'View accessible and returns scores',
          actual_result: hasRequiredFields ? 'PASS' : 'FAIL',
          error_message: hasRequiredFields ? undefined : 'Missing required fields',
          execution_time_ms: Date.now() - test5Start
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.push({
        test_name: 'Integrity Score View',
        description: 'Validate v_integrity_score returns valid data',
        expected_behavior: 'View accessible and returns scores',
        actual_result: 'ERROR',
        error_message: errorMessage,
        execution_time_ms: Date.now() - test5Start
      });
    }

    // ========================================
    // Build Final Report
    // ========================================
    const passed = results.filter(r => r.actual_result === 'PASS').length;
    const failed = results.filter(r => r.actual_result === 'FAIL').length;
    const errors = results.filter(r => r.actual_result === 'ERROR').length;

    const report: ChaosTestReport = {
      timestamp: new Date().toISOString(),
      total_tests: results.length,
      passed,
      failed,
      errors,
      global_result: failed > 0 ? 'CRITICAL_FAILURE' : errors > 0 ? 'SOME_FAILED' : 'ALL_PASS',
      tests: results,
      invariants_validated: [
        'INV-007: State Machine Formal',
        'INV-008: Side Effects Obrigatórios',
        'INV-009: Failed Error Message'
      ]
    };

    const executionTimeMs = Date.now() - startTime;
    console.log(`[chaos-test] Completed: ${passed}/${results.length} PASS, ${failed} FAIL, ${errors} ERROR`);

    // ========================================
    // PERSIST RESULTS TO DATABASE
    // ========================================
    try {
      const { error: persistError } = await supabase
        .from('chaos_test_results')
        .insert({
          executed_at: report.timestamp,
          total_tests: report.total_tests,
          passed: report.passed,
          failed: report.failed,
          errors: report.errors,
          global_result: report.global_result,
          report: report,
          execution_time_ms: executionTimeMs
        });

      if (persistError) {
        console.error('[chaos-test] Failed to persist results:', persistError.message);
      } else {
        console.log('[chaos-test] Results persisted to chaos_test_results table');
      }
    } catch (persistErr) {
      console.error('[chaos-test] Error persisting results:', persistErr);
    }

    // ========================================
    // CREATE CRITICAL ALERT ON FAILURE
    // ========================================
    if (failed > 0 || errors > 0) {
      try {
        // Get a tenant for the alert (system_alerts requires tenant_id)
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id')
          .limit(1)
          .single();

        if (tenant) {
          const { error: alertError } = await supabase
            .from('system_alerts')
            .insert({
              tenant_id: tenant.id,
              alert_type: 'chaos_test_failure',
              severity: 'critical',
              title: 'Chaos Test FAILED - System Integrity Compromised',
              message: `${failed} tests failed, ${errors} errors. Immediate investigation required.`,
              details: {
                report,
                failed_tests: results.filter(r => r.actual_result !== 'PASS'),
                execution_time_ms: executionTimeMs
              }
            });

          if (alertError) {
            console.error('[chaos-test] Failed to create alert:', alertError.message);
          } else {
            console.log('[chaos-test] CRITICAL ALERT created for failed tests');
          }
        }
      } catch (alertErr) {
        console.error('[chaos-test] Error creating alert:', alertErr);
      }
    }

    return new Response(JSON.stringify(report, null, 2), {
      status: report.global_result === 'ALL_PASS' ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[chaos-test] Fatal error:', error);
    return new Response(JSON.stringify({
      error: 'Chaos test failed',
      message: errorMessage,
      execution_time_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
