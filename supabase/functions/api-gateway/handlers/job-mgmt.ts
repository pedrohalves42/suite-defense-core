/**
 * create-job handler — inlined from standalone create-job function
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { CreateJobSchemaEnhanced } from '../../_shared/validation.ts';
import { createAuditLog } from '../../_shared/audit.ts';
import { checkRateLimit } from '../../_shared/rate-limit.ts';
import { logSecurityEvent, extractIpAddress } from '../../_shared/security-log.ts';
import { isFeatureEnabled } from '../../_shared/feature-flags.ts';
import type { HandlerContext } from './admin.ts';

type SB = any;

export async function handleCreateJob(
  supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  const tenantId = ctx?.tenantId;
  const req = ctx?.req;
  if (!userId) return { __status: 401, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } };

  // Role checks
  const { data: hasAdminRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
  const { data: hasOperatorRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'operator' });
  const { data: hasSuperAdminRole } = await supabase.rpc('is_super_admin', { _user_id: userId });

  if (!hasAdminRole && !hasOperatorRole && !hasSuperAdminRole) {
    if (req) {
      await createAuditLog({
        supabase, userId, tenantId: tenantId || 'unknown',
        action: 'job_creation_denied', resourceType: 'job',
        details: { reason: 'insufficient_permissions', required_roles: ['admin', 'operator', 'super_admin'] },
        request: req, success: false,
      });
    }
    return { __status: 403, error: { code: 'FORBIDDEN', message: 'Acesso negado. Necessario ser admin, operator ou super_admin.' } };
  }

  // Rate limiting
  const rl = await checkRateLimit(supabase, userId, 'create-job', {
    maxRequests: 60, windowMinutes: 1, blockMinutes: 5,
  });
  if (!rl.allowed) {
    return { __status: 429, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit excedido', resetAt: rl.resetAt } };
  }

  // Validate
  const validation = CreateJobSchemaEnhanced.safeParse(payload);
  if (!validation.success) {
    if (req) {
      const ipAddress = extractIpAddress(req);
      await logSecurityEvent({
        supabase, tenantId, userId, ipAddress,
        endpoint: 'create-job', attackType: 'invalid_input', severity: 'medium', blocked: true,
        details: { errors: validation.error.issues, input: payload },
        userAgent: req.headers.get('user-agent') || undefined, requestId,
      });
    }
    return { __status: 400, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: validation.error.flatten().fieldErrors } };
  }

  const { agentName, type, payload: userPayload, approved, scheduledAt, isRecurring, recurrencePattern } = validation.data;

  // Default payloads
  const defaultPayloads: Record<string, Record<string, unknown>> = {
    software_inventory_collect: { include_32bit: true, include_updates: true },
    light_vuln_scan: { scan_depth: 'standard', include_cve_check: true },
    collect_antivirus_status: { check_definitions: true },
    collect_web_activity: { browsers: ['chrome', 'firefox', 'edge'], days_back: 7, max_domains: 500 },
    collect_network_info: { include_open_ports: true, include_active_connections: true },
    fix_firewall: { enable_public: true, enable_private: true, enable_domain: true },
    update_agent: { force: false },
    restart_service: { service_name: 'CyberShieldAgent' },
    scan_file: { deep_scan: false },
    reinstall_agent: { clean_install: true },
  };
  const effectivePayload = { ...defaultPayloads[type], ...userPayload };

  // Fetch agent
  const { data: agentData, error: agentError } = await supabase
    .from('agents')
    .select('id, tenant_id, status, last_heartbeat, scheduling_paused, scheduling_paused_reason')
    .eq('agent_name', agentName)
    .limit(1)
    .maybeSingle();

  if (agentError || !agentData) {
    return { __status: 404, error: { code: 'AGENT_NOT_FOUND', message: 'Agente nao encontrado.' } };
  }

  if (agentData.scheduling_paused) {
    return { __status: 409, error: { code: 'AGENT_PAUSED', message: `Agente '${agentName}' esta com agendamento pausado: ${agentData.scheduling_paused_reason || 'versao incompativel'}` } };
  }

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const isAgentOnline = agentData.status === 'active' &&
    agentData.last_heartbeat &&
    new Date(agentData.last_heartbeat) > new Date(Date.now() - TWO_HOURS_MS);

  const exemptTypes = ['update_agent', 'reinstall_agent'];
  if (!isAgentOnline && !exemptTypes.includes(type)) {
    const lastHeartbeat = agentData.last_heartbeat
      ? new Date(agentData.last_heartbeat).toISOString() : 'never';
    return { __status: 409, error: { code: 'AGENT_OFFLINE', message: `Agente '${agentName}' esta offline ha mais de 2 horas (ultimo heartbeat: ${lastHeartbeat}).` } };
  }

  const agentOfflineWarning = !isAgentOnline
    ? `Agent '${agentName}' may be slow to respond. Job will expire in 4 hours if not claimed.`
    : null;

  const effectiveTenantId = agentData.tenant_id || tenantId;
  if (!effectiveTenantId) {
    return { __status: 400, error: { code: 'TENANT_NOT_FOUND', message: 'Tenant nao encontrado.' } };
  }

  // Cross-tenant check
  if (!hasSuperAdminRole && tenantId !== agentData.tenant_id) {
    return { __status: 403, error: { code: 'FORBIDDEN', message: 'Agente pertence a outro tenant.' } };
  }

  // Pre-validation: check if job type is disabled via feature flag
  const jobTypeFlag = `JOB_TYPE_ENABLED_${type.toUpperCase()}`;
  const jobTypeEnabled = await isFeatureEnabled(supabase, jobTypeFlag, effectiveTenantId);
  if (!jobTypeEnabled) {
    logger.info(`[create-job][${requestId}] Job type '${type}' disabled via feature flag for tenant ${effectiveTenantId}`);
    return { __status: 409, error: { code: 'JOB_TYPE_DISABLED', message: `Tipo de job '${type}' esta desabilitado. Taxa de falha historica alta.` } };
  }

  // Pre-validation: check agent failure rate for this job type
  const { data: failureCheck } = await supabase.rpc('check_agent_job_failure_rate', {
    p_agent_id: agentData.id, p_job_type: type, p_days_back: 7, p_threshold: 50.0,
  });
  if (failureCheck && failureCheck.length > 0 && failureCheck[0].should_skip) {
    const fr = failureCheck[0];
    logger.warn(`[create-job][${requestId}] Skipping job '${type}' for agent '${agentName}': failure rate ${fr.failure_rate}% (${fr.failed_jobs}/${fr.total_jobs})`);
    return {
      __status: 409,
      error: {
        code: 'HIGH_FAILURE_RATE',
        message: `Agente '${agentName}' tem taxa de falha de ${fr.failure_rate}% para '${type}' nos ultimos 7 dias (${fr.failed_jobs}/${fr.total_jobs} falharam). Job nao criado.`,
      },
    };
  }

  // Next run for recurring
  let nextRunAt = null;
  if (isRecurring && recurrencePattern) {
    const { data: nextRunData } = await supabase.rpc('calculate_next_run', {
      pattern: recurrencePattern, from_time: new Date().toISOString(),
    });
    nextRunAt = nextRunData;
  }

  const DEFAULT_TTL_HOURS = 4;
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_HOURS * 60 * 60 * 1000).toISOString();

  let job: Record<string, unknown>;

  if (!scheduledAt && !isRecurring) {
    const { data: newJobId, error: rpcError } = await supabase.rpc('create_job_if_not_exists', {
      p_agent_id: agentData.id, p_tenant_id: effectiveTenantId, p_type: type,
      p_payload: effectivePayload, p_priority: 5, p_ttl_hours: DEFAULT_TTL_HOURS,
    });
    if (rpcError) throw rpcError;
    if (!newJobId) {
      return { __status: 409, error: { code: 'JOB_ALREADY_EXISTS', message: `Ja existe um job ativo do tipo '${type}' para o agente '${agentName}'.` } };
    }
    const { data: fetchedJob, error: fetchError } = await supabase.from('jobs').select('id, agent_id, agent_name, tenant_id, type, status, payload, created_at, expires_at, scheduled_at, is_recurring, recurrence_pattern').eq('id', newJobId).single();
    if (fetchError) throw fetchError;
    job = fetchedJob;
  } else {
    const jobData = {
      agent_id: agentData.id, agent_name: agentName, type, payload: effectivePayload,
      status: 'queued', approved, tenant_id: effectiveTenantId,
      scheduled_at: scheduledAt || null, is_recurring: isRecurring,
      recurrence_pattern: recurrencePattern || null, next_run_at: nextRunAt, expires_at: expiresAt,
    };
    const { data: insertedJob, error: insertError } = await supabase
      .from('jobs').insert(jobData).select().order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (insertError) throw insertError;
    job = insertedJob!;
  }

  if (req) {
    await createAuditLog({
      supabase, userId, tenantId: effectiveTenantId,
      action: 'job_created', resourceType: 'job', resourceId: job.id as string,
      details: { agent_name: agentName, type, approved, scheduled_at: scheduledAt, is_recurring: isRecurring, recurrence_pattern: recurrencePattern },
      request: req, success: true,
    });
  }

  return {
    __status: 201,
    id: job.id, type: job.type, agentName: job.agent_name,
    scheduledAt: job.scheduled_at, isRecurring: job.is_recurring,
    nextRunAt: job.next_run_at, expiresAt: job.expires_at, warning: agentOfflineWarning,
  };
}
