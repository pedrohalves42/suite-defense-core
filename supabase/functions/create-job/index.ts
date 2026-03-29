import { serveTenant } from '../_shared/serve-tenant.ts';
import { CreateJobSchemaEnhanced } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logSecurityEvent, extractIpAddress } from '../_shared/security-log.ts';
import { handleValidationError, corsHeaders } from '../_shared/error-handler.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

serveTenant(async (req, ctx) => {
  const origin = req.headers.get("origin");
  const { supabase, tenantId, userId, requestId, body: rawData } = ctx;

  // Role checks ? serveTenant validates JWT + tenant, but not roles
  const { data: hasAdminRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'admin' });
  const { data: hasOperatorRole } = await supabase.rpc('has_role', { _user_id: userId, _role: 'operator' });
  const { data: hasSuperAdminRole } = await supabase.rpc('is_super_admin', { _user_id: userId });

  if (!hasAdminRole && !hasOperatorRole && !hasSuperAdminRole) {
    await createAuditLog({ 
      supabase, 
      userId: userId!, 
      tenantId, 
      action: 'job_creation_denied', 
      resourceType: 'job', 
      details: { reason: 'insufficient_permissions', required_roles: ['admin', 'operator', 'super_admin'] }, 
      request: req, 
      success: false 
    });
    
    return new Response(
      JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Acesso negado. Necessario ser admin, operator ou super_admin.' } }), 
      { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Rate limiting per user
  const rateLimitResult = await checkRateLimit(supabase, userId!, 'create-job', {
    maxRequests: 60, windowMinutes: 1, blockMinutes: 5,
  });

  if (!rateLimitResult.allowed) {
    return new Response(
      JSON.stringify({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit excedido', resetAt: rateLimitResult.resetAt } }),
      { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Validate with enhanced schema
  const validation = CreateJobSchemaEnhanced.safeParse(rawData);
  
  if (!validation.success) {
    const ipAddress = extractIpAddress(req);
    await logSecurityEvent({
      supabase,
      tenantId,
      userId: userId!,
      ipAddress,
      endpoint: 'create-job',
      attackType: 'invalid_input',
      severity: 'medium',
      blocked: true,
      details: { errors: validation.error.issues, input: rawData },
      userAgent: req.headers.get('user-agent') || undefined,
      requestId
    });
    return handleValidationError(validation.error, requestId);
  }
  
  const { agentName, type, payload: userPayload, approved, scheduledAt, isRecurring, recurrencePattern } = validation.data;

  // Default payloads for each job type
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
    await createAuditLog({ 
      supabase, userId: userId!, tenantId, 
      action: 'job_creation_denied', resourceType: 'job', 
      details: { reason: 'agent_not_found', agent_name: agentName }, 
      request: req, success: false 
    });
    return new Response(
      JSON.stringify({ error: { code: 'AGENT_NOT_FOUND', message: 'Agente nao encontrado.' } }), 
      { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Block paused agents
  if (agentData.scheduling_paused) {
    return new Response(
      JSON.stringify({ error: { code: 'AGENT_PAUSED', message: `Agente '${agentName}' esta com agendamento pausado: ${agentData.scheduling_paused_reason || 'versao incompativel, aguardando atualizacao manual'}` } }), 
      { status: 409, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Check agent online status
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const isAgentOnline = agentData.status === 'active' && 
    agentData.last_heartbeat && 
    new Date(agentData.last_heartbeat) > new Date(Date.now() - TWO_HOURS_MS);
  
  const exemptTypes = ['update_agent', 'reinstall_agent'];
  if (!isAgentOnline && !exemptTypes.includes(type)) {
    const lastHeartbeat = agentData.last_heartbeat 
      ? new Date(agentData.last_heartbeat).toISOString() : 'never';
    
    await createAuditLog({ 
      supabase, userId: userId!, tenantId: agentData.tenant_id || tenantId, 
      action: 'job_creation_blocked_offline', resourceType: 'job', 
      details: { reason: 'agent_offline_2h', agent_name: agentName, last_heartbeat: lastHeartbeat, job_type: type }, 
      request: req, success: false 
    });

    return new Response(
      JSON.stringify({ error: { code: 'AGENT_OFFLINE', message: `Agente '${agentName}' esta offline ha mais de 2 horas (ultimo heartbeat: ${lastHeartbeat}). Nao e possivel criar jobs para agentes inacessiveis.` } }), 
      { status: 409, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  const agentOfflineWarning = !isAgentOnline 
    ? `Agent '${agentName}' may be slow to respond. Job will expire in 4 hours if not claimed.` 
    : null;

  const effectiveTenantId = agentData.tenant_id || tenantId;

  if (!effectiveTenantId) {
    await createAuditLog({ 
      supabase, userId: userId!, tenantId: 'unknown', 
      action: 'job_creation_denied', resourceType: 'job', 
      details: { reason: 'tenant_not_found', is_super_admin: hasSuperAdminRole }, 
      request: req, success: false 
    });
    return new Response(
      JSON.stringify({ error: { code: 'TENANT_NOT_FOUND', message: 'Tenant nao encontrado.' } }), 
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Cross-tenant check (except super_admin)
  if (!hasSuperAdminRole && tenantId !== agentData.tenant_id) {
    return new Response(
      JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Agente pertence a outro tenant.' } }), 
      { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Calculate next_run_at for recurring jobs
  let nextRunAt = null;
  if (isRecurring && recurrencePattern) {
    const { data: nextRunData } = await supabase.rpc('calculate_next_run', {
      pattern: recurrencePattern,
      from_time: new Date().toISOString()
    });
    nextRunAt = nextRunData;
  }

  const DEFAULT_TTL_HOURS = 4;
  const expiresAt = new Date(Date.now() + DEFAULT_TTL_HOURS * 60 * 60 * 1000).toISOString();

  let job: Record<string, unknown>;
  
  if (!scheduledAt && !isRecurring) {
    // Atomic dedup guard
    const { data: newJobId, error: rpcError } = await supabase.rpc('create_job_if_not_exists', {
      p_agent_id: agentData.id,
      p_tenant_id: effectiveTenantId,
      p_type: type,
      p_payload: effectivePayload,
      p_priority: 5,
      p_ttl_hours: DEFAULT_TTL_HOURS
    });

    if (rpcError) throw rpcError;

    if (!newJobId) {
      return new Response(
        JSON.stringify({ error: { code: 'JOB_ALREADY_EXISTS', message: `Ja existe um job ativo do tipo '${type}' para o agente '${agentName}'.` } }),
        { status: 409, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const { data: fetchedJob, error: fetchError } = await supabase
      .from('jobs').select('*').eq('id', newJobId).single();
    if (fetchError) throw fetchError;
    job = fetchedJob;
  } else {
    // Scheduled/recurring jobs
    const jobData = {
      agent_id: agentData.id,
      agent_name: agentName,
      type,
      payload: effectivePayload,
      status: 'queued',
      approved,
      tenant_id: effectiveTenantId,
      scheduled_at: scheduledAt || null,
      is_recurring: isRecurring,
      recurrence_pattern: recurrencePattern || null,
      next_run_at: nextRunAt,
      expires_at: expiresAt,
    };

    const { data: insertedJob, error: insertError } = await supabase
      .from('jobs').insert(jobData).select()
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (insertError) throw insertError;
    job = insertedJob!;
  }

  await createAuditLog({
    supabase, userId: userId!, tenantId: effectiveTenantId,
    action: 'job_created', resourceType: 'job', resourceId: (job as Record<string, unknown>).id as string,
    details: { 
      agent_name: agentName, type, approved, scheduled_at: scheduledAt,
      is_recurring: isRecurring, recurrence_pattern: recurrencePattern,
      resolved_tenant_via: hasSuperAdminRole && !tenantId ? 'agent_lookup' : 'user_role'
    }, 
    request: req, success: true 
  });

  return new Response(
    JSON.stringify({ 
      id: (job as Record<string, unknown>).id, type: (job as Record<string, unknown>).type, 
      agentName: (job as Record<string, unknown>).agent_name,
      scheduledAt: (job as Record<string, unknown>).scheduled_at,
      isRecurring: (job as Record<string, unknown>).is_recurring,
      nextRunAt: (job as Record<string, unknown>).next_run_at,
      expiresAt: (job as Record<string, unknown>).expires_at,
      warning: agentOfflineWarning,
    }), 
    { status: 201, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
  );
});
