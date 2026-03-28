/**
 * Execute Playbook - Migrated to assertInternalCaller
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { handleException } from '../_shared/error-handler.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const PlaybookSchema = z.object({
  playbook_id: z.string().uuid(),
  trigger_data: z.object({
    tenant_id: z.string().uuid(),
    agent_id: z.string().uuid().optional(),
    trigger_source: z.string().optional(),
    reason: z.string().optional(),
  }).passthrough(),
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const parsed = PlaybookSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { playbook_id, trigger_data } = parsed.data;

    const { data: playbook, error: pbError } = await supabase
      .from('playbooks')
      .select('*')
      .eq('id', playbook_id)
      .eq('tenant_id', trigger_data.tenant_id)
      .eq('is_enabled', true)
      .single();

    if (pbError || !playbook) {
      return new Response(
        JSON.stringify({ error: 'Playbook not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[execute-playbook] Starting execution', { requestId, playbookId: playbook_id, playbookName: playbook.name });

    const results: Array<{ action: string; success: boolean; result?: unknown; error?: string }> = [];

    const actions = [
      { action: 'create_alert', execute: () => createAlert(supabase, playbook, trigger_data) },
      { action: 'collect_evidence', execute: () => collectEvidence(supabase, trigger_data) },
    ];

    for (const action of actions) {
      try {
        const result = await action.execute();
        results.push({ action: action.action, success: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ action: action.action, success: false, error: msg });
      }
    }

    const { error: execError } = await supabase
      .from('playbook_executions')
      .insert({
        playbook_id,
        tenant_id: trigger_data.tenant_id,
        agent_id: trigger_data.agent_id || null,
        trigger_source: trigger_data.trigger_source || 'automation',
        trigger_context: trigger_data,
        triggered_at: new Date().toISOString(),
        status: results.every(r => r.success) ? 'completed' : 'partial_failure',
        actions_taken: results,
        auto_executed: true,
        triggered_by: 'system',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

    if (execError) {
      logger.error('[execute-playbook] Failed to record execution', { error: execError.message });
    }

    logger.info('[execute-playbook] Execution completed', {
      requestId,
      stepsExecuted: results.length,
      successfulSteps: results.filter(r => r.success).length,
    });

    return new Response(
      JSON.stringify({
        success: true, request_id: requestId,
        steps_executed: results.length,
        successful_steps: results.filter(r => r.success).length,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'execute-playbook');
  }
});

// deno-lint-ignore no-explicit-any
async function createAlert(supabase: any, playbook: any, triggerData: any) {
  const { error } = await supabase.from('system_alerts').insert({
    tenant_id: triggerData.tenant_id,
    agent_id: triggerData.agent_id || null,
    alert_type: 'playbook_execution',
    severity: playbook.severity || 'medium',
    title: `Playbook: ${playbook.name}`,
    message: `Playbook "${playbook.name}" triggered: ${triggerData.reason || 'automated response'}`,
    details: { playbook_id: playbook.id, trigger_data: triggerData },
  });
  if (error) throw new Error(error.message);
  return { alert_created: true };
}

// deno-lint-ignore no-explicit-any
async function collectEvidence(supabase: any, triggerData: any) {
  if (!triggerData.agent_id) return { skipped: true, reason: 'no_agent_id' };

  const { data: agent } = await supabase
    .from('agents')
    .select('agent_name, tenant_id')
    .eq('id', triggerData.agent_id)
    .single();

  if (!agent) return { skipped: true, reason: 'agent_not_found' };

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      agent_id: triggerData.agent_id,
      agent_name: agent.agent_name,
      tenant_id: agent.tenant_id,
      type: 'software_inventory_collect',
      status: 'pending',
      payload: { collect_evidence: true, trigger: triggerData.reason },
      priority: 1,
      expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return { evidence_job_created: job.id };
}
