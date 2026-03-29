import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { runQualityCheck, createQualityAlert, logQualityCheck } from '../_shared/ai-quality-monitor.ts';
import { AIPromptRegistry } from '../_shared/ai-prompt-registry.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .in('role', ['admin', 'super_admin'])
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const { action } = await req.json();

    // === PROMPT INVENTORY ===
    if (action === 'prompt_inventory') {
      const inventory = await AIPromptRegistry.getPromptInventory();
      
      // Verify integrity of all prompts
      const integrityResults: Record<string, boolean> = {};
      for (const prompt of inventory.prompts) {
        integrityResults[prompt.id] = await AIPromptRegistry.verifyPromptIntegrity(prompt.id);
      }

      return new Response(JSON.stringify({
        success: true,
        inventory,
        integrity: integrityResults,
        all_valid: Object.values(integrityResults).every(v => v),
      }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // === QUALITY CHECK ===
    if (action === 'quality_check') {
      const functions = [
        'ai-analyze-agent',
        'ai-system-analyzer',
        'analyze-network-anomalies',
        'analyze-url',
      ];

      const results: Record<string, {
        passed: boolean;
        score: number;
        issues: string[];
      }> = {};

      for (const fn of functions) {
        const result = await runQualityCheck(fn);
        results[fn] = {
          passed: result.passed,
          score: result.score,
          issues: result.issues,
        };

        // Log quality check
        logQualityCheck(fn, result);

        // Create alerts for critical issues
        if (result.score < 50) {
          await createQualityAlert(fn, {
            type: 'error_rate',
            severity: 'critical',
            current_value: result.score,
            baseline_value: 100,
            deviation_percent: 100 - result.score,
            message: `AI function ${fn} quality score critically low: ${result.score}/100`,
          }, roleData.tenant_id);
        }
      }

      const overallScore = Math.round(
        Object.values(results).reduce((sum, r) => sum + r.score, 0) / functions.length
      );
      const allPassed = Object.values(results).every(r => r.passed);

      return new Response(JSON.stringify({
        success: true,
        overall_score: overallScore,
        all_passed: allPassed,
        results,
        checked_at: new Date().toISOString(),
      }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    // === DRIFT ANALYSIS ===
    if (action === 'drift_analysis') {
      const { data: metrics } = await supabase
        .from('ai_inference_metrics')
        .select('function_name, latency_ms, success, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!metrics || metrics.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          message: 'No metrics available for drift analysis',
          data: null,
        }), {
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
        });
      }

      // Group by function and calculate trends
      const byFunction: Record<string, {
        avg_latency: number;
        success_rate: number;
        sample_count: number;
        trend: 'stable' | 'improving' | 'degrading';
      }> = {};

      const functionGroups = metrics.reduce((acc, m) => {
        if (!acc[m.function_name]) acc[m.function_name] = [];
        acc[m.function_name].push(m);
        return acc;
      }, {} as Record<string, typeof metrics>);

      for (const [fn, fnMetrics] of Object.entries(functionGroups)) {
        const latencies = fnMetrics.map(m => m.latency_ms);
        const successCount = fnMetrics.filter(m => m.success).length;
        
        // Simple trend: compare first half to second half
        const midpoint = Math.floor(latencies.length / 2);
        const firstHalf = latencies.slice(0, midpoint);
        const secondHalf = latencies.slice(midpoint);
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);
        
        let trend: 'stable' | 'improving' | 'degrading' = 'stable';
        const change = ((secondAvg - firstAvg) / (firstAvg || 1)) * 100;
        if (change > 20) trend = 'degrading';
        else if (change < -20) trend = 'improving';

        byFunction[fn] = {
          avg_latency: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
          success_rate: Math.round((successCount / fnMetrics.length) * 100),
          sample_count: fnMetrics.length,
          trend,
        };
      }

      return new Response(JSON.stringify({
        success: true,
        analysis: byFunction,
        total_samples: metrics.length,
        analyzed_at: new Date().toISOString(),
      }), {
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });

  } catch (error) {
    logger.error('[AI Quality Check] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
