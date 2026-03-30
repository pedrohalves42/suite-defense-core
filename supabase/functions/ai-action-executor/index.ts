/**
 * AI Action Executor - Modularized
 * Executes AI-suggested actions after validation, whitelist check, and rate limiting.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger, loggerWithContext } from '../_shared/logger.ts';
import { executeActionByType } from './handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = loggerWithContext(requestId);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(req.headers.get('origin')) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization header');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { action_id } = await req.json();
    if (!action_id) throw new Error('action_id is required');

    log.info('Processing action', { action_id, user_id: user.id });

    // Fetch action
    const { data: action, error: actionError } = await supabase
      .from('ai_actions').select('*, ai_insights(*)').eq('id', action_id).single();
    if (actionError || !action) throw new Error('Action not found');

    // Verify admin role
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles').select('role, tenant_id')
      .eq('user_id', user.id).eq('tenant_id', action.tenant_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (roleError || !userRole || !['admin', 'super_admin'].includes(userRole.role)) throw new Error('Forbidden: Only admins can execute actions');

    // Whitelist check
    const { data: actionConfig, error: configError } = await supabase
      .from('ai_action_configs').select('*').eq('action_type', action.action_type).maybeSingle();
    if (configError || !actionConfig) throw new Error(`Action type ${action.action_type} not found in whitelist`);
    if (!actionConfig.is_enabled) throw new Error(`Action type ${action.action_type} is disabled`);
    if (actionConfig.requires_approval && action.status !== 'pending') throw new Error('Action already processed');

    // Rate limit
    const { data: canExecute, error: rateLimitError } = await supabase.rpc('check_action_rate_limit', { p_action_type: action.action_type, p_tenant_id: action.tenant_id });
    if (rateLimitError || !canExecute) throw new Error('Rate limit exceeded for this action type');

    // Safe mode check
    const { data: safeMode } = await supabase.from('tenant_features').select('enabled').eq('tenant_id', action.tenant_id).eq('feature_key', 'ai_safe_mode').maybeSingle();
    if (safeMode?.enabled && actionConfig.risk_level === 'high') throw new Error('Safe mode blocks high-risk actions');

    // Execute action
    let executionResult: Record<string, unknown> = {};
    let executionStatus = 'executed';
    let errorMessage: string | null = null;

    try {
      executionResult = await executeActionByType(
        action.action_type, action.action_payload, supabase,
        action.tenant_id, action.insight_id, user.id, req,
      );
    } catch (execError: unknown) {
      const err = execError as Error;
      log.error('Execution failed: ' + err.message, { action_type: action.action_type });
      executionStatus = 'failed';
      errorMessage = err.message;
      executionResult = { error: err.message };
    }

    // Audit log
    await supabase.from('ai_action_executions').insert({
      action_id: action.id, tenant_id: action.tenant_id, executed_by: user.id,
      execution_status: executionStatus, execution_result: executionResult,
      error_message: errorMessage, executed_at: new Date().toISOString(),
    });

    // Update action status
    await supabase.from('ai_actions').update({
      status: executionStatus, executed_by: user.id,
      executed_at: new Date().toISOString(), result: executionResult,
    }).eq('id', action.id);

    // Security logging
    if (executionStatus === 'executed') {
      await supabase.from('security_logs').insert({
        tenant_id: action.tenant_id, user_id: user.id,
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown',
        endpoint: '/functions/v1/ai-action-executor', attack_type: 'ai_action_executed',
        severity: actionConfig.risk_level === 'high' ? 'high' : 'info', blocked: false,
        user_agent: req.headers.get('user-agent') || 'unknown',
        details: { action_id: action.id, action_type: action.action_type, executed_by: user.id, insight_id: action.insight_id, risk_level: actionConfig.risk_level, result_summary: executionResult },
      });
    }

    log.info('Action completed', { action_id, status: executionStatus });

    return new Response(JSON.stringify({ success: executionStatus === 'executed', action_id: action.id, execution_status: executionStatus, result: executionResult, error: errorMessage }),
      { headers: { ...buildCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const err = error as Error;
    logger.error('AI action executor error', err);
    return new Response(JSON.stringify({ error: err.message, details: err.toString() }),
      { status: err.message.includes('Unauthorized') || err.message.includes('Forbidden') ? 403 : 400, headers: { ...buildCorsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' } });
  }
});
