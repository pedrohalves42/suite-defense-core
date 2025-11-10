import { corsHeaders } from '../_shared/error-handler.ts';

/**
 * Test endpoint to verify INTERNAL_FUNCTION_SECRET is properly configured
 * This function tests authentication for internal edge function calls
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!internalSecret) {
      return new Response(
        JSON.stringify({ 
          error: 'INTERNAL_FUNCTION_SECRET não está configurado',
          status: 'failed',
          requestId
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[TEST-INTERNAL-AUTH] Testing internal function authentication`);
    console.log(`[TEST-INTERNAL-AUTH] INTERNAL_FUNCTION_SECRET is set: ${internalSecret ? 'yes' : 'no'}`);

    // Test 1: Call send-alert-email with correct secret
    let test1Result = { success: false, error: '' };
    try {
      const response1 = await fetch(`${supabaseUrl}/functions/v1/send-alert-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': internalSecret,
        },
        body: JSON.stringify({
          alertType: 'test',
          message: 'Test internal authentication',
          details: { test: true },
          recipientEmails: ['test@example.com'],
        }),
      });

      test1Result = {
        success: response1.ok,
        error: response1.ok ? '' : `Status ${response1.status}: ${await response1.text()}`,
      };
    } catch (error) {
      test1Result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    // Test 2: Call send-alert-email with incorrect secret
    let test2Result = { success: false, error: '' };
    try {
      const response2 = await fetch(`${supabaseUrl}/functions/v1/send-alert-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'wrong-secret',
        },
        body: JSON.stringify({
          alertType: 'test',
          message: 'Test with wrong secret',
          details: { test: true },
          recipientEmails: ['test@example.com'],
        }),
      });

      // Should fail with 401/403
      test2Result = {
        success: !response2.ok && (response2.status === 401 || response2.status === 403),
        error: response2.ok ? 'Should have failed but succeeded' : `Correctly rejected with status ${response2.status}`,
      };
    } catch (error) {
      test2Result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    // Test 3: Call monitor-agent-health with correct secret
    let test3Result = { success: false, error: '' };
    try {
      const response3 = await fetch(`${supabaseUrl}/functions/v1/monitor-agent-health`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': internalSecret,
        },
      });

      test3Result = {
        success: response3.ok,
        error: response3.ok ? '' : `Status ${response3.status}: ${await response3.text()}`,
      };
    } catch (error) {
      test3Result = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    const allTestsPassed = test1Result.success && test2Result.success && test3Result.success;

    return new Response(
      JSON.stringify({
        status: allTestsPassed ? 'passed' : 'failed',
        secretConfigured: !!internalSecret,
        tests: {
          sendAlertEmailWithCorrectSecret: test1Result,
          sendAlertEmailWithWrongSecret: test2Result,
          monitorAgentHealthWithCorrectSecret: test3Result,
        },
        summary: {
          total: 3,
          passed: [test1Result, test2Result, test3Result].filter(t => t.success).length,
          failed: [test1Result, test2Result, test3Result].filter(t => !t.success).length,
        },
        requestId,
      }),
      { 
        status: allTestsPassed ? 200 : 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('[TEST-INTERNAL-AUTH] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error),
        status: 'error',
        requestId
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
