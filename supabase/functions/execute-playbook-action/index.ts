/**
 * Execute Playbook Action - Orchestrator
 * Auth: serveTenant (JWT + tenant isolation)
 * 
 * Decomposed from 851-line monolith into:
 * - types.ts (shared interfaces)
 * - action-dispatcher.ts (routing)
 * - handlers/notify.ts, agent-jobs.ts, security.ts (action implementations)
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import type { PlaybookAction, ExecuteRequest, ActionResult, ActionContext } from './types.ts';
import { executeAction } from './action-dispatcher.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const PlaybookActionSchema = z.object({
  execution_id: z.string().uuid(),
  action_index: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

const DESTRUCTIVE_ACTIONS = [
  'isolate_agent', 'isolate',
  'uninstall_software',
  'block_ip',
  'kill_process',
  'stop_service',
  'disable_service',
  'revoke_token'
];

serveTenant(async (req, ctx) => {
  const origin = req.headers.get("origin");
  const { supabase, tenantId, userId, requestId, body } = ctx;
  const startTime = Date.now();

  const parsed = PlaybookActionSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), {
      status: 400,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
  const { execution_id, action_index, notes } = parsed.data;

  logger.info(`[execute-playbook-action] Executing ${execution_id}, action_index: ${action_index}`);

  // Role check: user must be admin/super_admin/operator in this tenant
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'super_admin', 'operator'])
    .limit(1)
    .maybeSingle();

  if (!userRole) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Fetch execution with tenant filter
  const { data: execution, error: execError } = await supabase
    .from('playbook_executions')
    .select('*')
    .eq('id', execution_id)
    .eq('tenant_id', tenantId)
    .single();

  if (execError || !execution) {
    logger.error('[execute-playbook-action] Execution not found:', execError);
    return new Response(JSON.stringify({ error: 'Execution not found' }), {
      status: 404,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Check if already finalized
  if (['completed', 'failed', 'cancelled', 'ignored'].includes(execution.status)) {
    return new Response(JSON.stringify({
      error: 'Execution already finalized',
      status: execution.status
    }), {
      status: 400,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Use immutable snapshot
  const actionsSnapshot = execution.actions_snapshot as PlaybookAction[] || [];
  const playbookSnapshot = execution.playbook_snapshot as Record<string, unknown> || {};

  if (actionsSnapshot.length === 0) {
    return new Response(JSON.stringify({ error: 'No actions found in snapshot' }), {
      status: 400,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  // Execution mode enforcement
  const executionMode = (playbookSnapshot.execution_mode as string) || 'assistive';

  // Semi-automatic: require approval
  if (executionMode === 'semi_automatic') {
    const { data: approvalRequest, error: approvalError } = await supabase
      .from('approval_requests')
      .select('id, status, expires_at, approved_by, approved_at')
      .eq('playbook_execution_id', execution_id)
      .eq('status', 'approved')
      .single();

    if (approvalError || !approvalRequest) {
      const { data: pendingRequest } = await supabase
        .from('approval_requests')
        .select('id, status, expires_at')
        .eq('playbook_execution_id', execution_id)
        .eq('status', 'pending')
        .single();

      logger.info(`[execute-playbook-action] BLOCKED: Semi-automatic playbook requires approval`);

      await supabase.from('audit_logs').insert({
        user_id: userId,
        tenant_id: execution.tenant_id,
        action: 'blocked_semi_automatic_no_approval',
        resource_type: 'playbook_execution',
        resource_id: execution_id,
        success: false,
        details: {
          playbook_name: playbookSnapshot.name,
          playbook_version: playbookSnapshot.version,
          execution_mode: executionMode,
          reason: 'Semi-automatic playbook requires approval before execution',
          pending_request_id: pendingRequest?.id || null,
          pending_request_expires: pendingRequest?.expires_at || null,
        },
      });

      return new Response(JSON.stringify({
        error: 'Semi-automatic playbook requires approval before execution',
        execution_mode: executionMode,
        pending_approval: !!pendingRequest,
        pending_request_id: pendingRequest?.id || null,
        expires_at: pendingRequest?.expires_at || null,
      }), {
        status: 403,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    logger.info(`[execute-playbook-action] Semi-automatic approval verified: ${approvalRequest.id}`);
  }

  // Assistive mode: block destructive actions
  if (executionMode === 'assistive') {
    const destructiveActions = actionsSnapshot.filter(a =>
      DESTRUCTIVE_ACTIONS.includes(a.action_type)
    );

    if (destructiveActions.length > 0) {
      logger.info(`[execute-playbook-action] BLOCKED: Destructive actions in assistive mode`);

      await supabase.from('audit_logs').insert({
        user_id: userId,
        tenant_id: execution.tenant_id,
        action: 'blocked_destructive_action',
        resource_type: 'playbook_execution',
        resource_id: execution_id,
        success: false,
        details: {
          playbook_name: playbookSnapshot.name,
          playbook_version: playbookSnapshot.version,
          execution_mode: executionMode,
          blocked_actions: destructiveActions.map(a => ({
            action_type: a.action_type,
            label: a.label,
          })),
          reason: 'Assistive mode does not allow destructive actions',
        },
      });

      return new Response(JSON.stringify({
        error: 'Cannot execute destructive actions in assistive mode',
        execution_mode: executionMode,
        blocked_actions: destructiveActions.map(a => ({
          action_type: a.action_type,
          label: a.label,
        })),
        allowed_modes: ['semi_automatic', 'automatic'],
      }), {
        status: 403,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
  }

  logger.info(`[execute-playbook-action] Using immutable snapshot v${playbookSnapshot.version} with ${actionsSnapshot.length} actions (mode: ${executionMode})`);

  // Update status to in_progress
  await supabase
    .from('playbook_executions')
    .update({
      status: 'in_progress',
      executed_by: userId,
      notes: notes || execution.notes,
    })
    .eq('id', execution_id);

  // Determine actions to execute
  const actionsToExecute = action_index !== undefined
    ? [actionsSnapshot[action_index]]
    : actionsSnapshot;

  const actionResults: ActionResult[] = execution.actions_taken || [];
  const evidenceIds: string[] = execution.evidence_ids || [];

  // Build action context
  const actionCtx: ActionContext = {
    supabase,
    tenantId,
    agentId: execution.agent_id as string | null,
    userId: userId!,
    executionId: execution_id,
    playbookSnapshot,
    triggerContext: execution.trigger_context as Record<string, unknown> || {},
  };

  // Execute each action from snapshot
  for (const action of actionsToExecute) {
    if (!action) continue;

    logger.info(`[execute-playbook-action] Executing action: ${action.action_type} - ${action.label}`);

    try {
      const result = await executeAction(action, actionCtx);

      actionResults.push({
        action_id: action.id,
        action_type: action.action_type,
        label: action.label,
        success: true,
        result,
        executed_at: new Date().toISOString(),
      });

      if (result?.evidence_id) {
        evidenceIds.push(result.evidence_id as string);
      }
    } catch (actionError) {
      logger.error(`[execute-playbook-action] Action failed:`, actionError);

      actionResults.push({
        action_id: action.id,
        action_type: action.action_type,
        label: action.label,
        success: false,
        error: actionError instanceof Error ? actionError.message : 'Unknown error',
        executed_at: new Date().toISOString(),
      });
    }
  }

  // Determine final status
  const allActionsExecuted = actionResults.length >= actionsSnapshot.length;
  const anyFailed = actionResults.some(r => !r.success);
  const finalStatus = allActionsExecuted
    ? (anyFailed ? 'failed' : 'completed')
    : 'in_progress';

  // Update execution
  await supabase
    .from('playbook_executions')
    .update({
      status: finalStatus,
      actions_taken: actionResults,
      evidence_ids: evidenceIds,
      completed_at: allActionsExecuted ? new Date().toISOString() : null,
    })
    .eq('id', execution_id);

  // Audit log
  await supabase.from('audit_logs').insert({
    user_id: userId,
    tenant_id: execution.tenant_id,
    action: 'execute_playbook',
    resource_type: 'playbook_execution',
    resource_id: execution_id,
    success: !anyFailed,
    details: {
      playbook_name: playbookSnapshot.name,
      playbook_version: playbookSnapshot.version,
      actions_executed: actionResults.length,
      actions_succeeded: actionResults.filter(r => r.success).length,
      used_immutable_snapshot: true,
      execution_time_ms: Date.now() - startTime,
    },
  });

  logger.info(`[execute-playbook-action] Completed in ${Date.now() - startTime}ms (snapshot v${playbookSnapshot.version})`);

  return new Response(JSON.stringify({
    success: true,
    execution_id,
    status: finalStatus,
    playbook_version: playbookSnapshot.version,
    actions_executed: actionResults.length,
    results: actionResults,
    evidence_ids: evidenceIds,
    used_immutable_snapshot: true,
  }), {
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
});
