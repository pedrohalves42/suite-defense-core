import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, handleValidationError, createErrorResponse, ErrorCode, corsHeaders } from '../_shared/error-handler.ts';
import { CreateJobSchemaEnhanced } from '../_shared/validation.ts';
import { createAuditLog } from '../_shared/audit.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logSecurityEvent, extractIpAddress } from '../_shared/security-log.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Nao autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Buscar tenant_id do usuario autenticado primeiro
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Verificar se o usuario tem permissao (admin, operator ou super_admin)
    const { data: hasAdminRole } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    const { data: hasOperatorRole } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'operator' });
    const { data: hasSuperAdminRole } = await supabaseAdmin.rpc('is_super_admin', { _user_id: user.id });

    if (!hasAdminRole && !hasOperatorRole && !hasSuperAdminRole) {
      await createAuditLog({ 
        supabase: supabaseAdmin, 
        userId: user.id, 
        tenantId: userRole?.tenant_id || 'unknown', 
        action: 'job_creation_denied', 
        resourceType: 'job', 
        details: { 
          reason: 'insufficient_permissions', 
          required_roles: ['admin', 'operator', 'super_admin'] 
        }, 
        request: req, 
        success: false 
      });
      
      return new Response(
        JSON.stringify({ 
          error: {
            code: 'FORBIDDEN',
            message: 'Acesso negado. Necessario ser admin, operator ou super_admin.'
          }
        }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting por usuario (prevenir flooding de jobs)
    const rateLimitResult = await checkRateLimit(supabaseAdmin, user.id, 'create-job', {
      maxRequests: 60,
      windowMinutes: 1,
      blockMinutes: 5,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Rate limit excedido',
            resetAt: rateLimitResult.resetAt
          }
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawData = await req.json();
    
    // Validate with enhanced schema
    const validation = CreateJobSchemaEnhanced.safeParse(rawData);
    
    if (!validation.success) {
      const ipAddress = extractIpAddress(req);
      
      // Log validation failure
      await logSecurityEvent({
        supabase: supabaseAdmin,
        tenantId: userRole?.tenant_id,
        userId: user.id,
        ipAddress,
        endpoint: 'create-job',
        attackType: 'invalid_input',
        severity: 'medium',
        blocked: true,
        details: {
          errors: validation.error.issues,
          input: rawData
        },
        userAgent: req.headers.get('user-agent') || undefined,
        requestId
      });
      
      return handleValidationError(validation.error, requestId);
    }
    
    const { agentName, type, payload: userPayload, approved, scheduledAt, isRecurring, recurrencePattern } = validation.data;

    // Default payloads for each job type - ensures jobs always have valid payload
    const defaultPayloads: Record<string, Record<string, unknown>> = {
      software_inventory_collect: { include_32bit: true, include_updates: true },
      light_vuln_scan: { scan_depth: 'standard', include_cve_check: true },
      collect_antivirus_status: { check_definitions: true },
      collect_web_activity: { browsers: ['chrome', 'firefox', 'edge'], days_back: 7 },
      collect_network_info: { include_open_ports: true, include_active_connections: true },
      fix_firewall: { enable_public: true, enable_private: true, enable_domain: true },
      update_agent: { force: false },
      restart_service: { service_name: 'CyberShieldAgent' },
      scan_file: { deep_scan: false },
      reinstall_agent: { clean_install: true },
    };

    // Merge user payload with defaults (user payload takes precedence)
    const effectivePayload = {
      ...defaultPayloads[type],
      ...userPayload,
    };

    // SEMPRE buscar o agente para obter agent_id, tenant_id e status
    const { data: agentData, error: agentError } = await supabaseAdmin
      .from('agents')
      .select('id, tenant_id, status, last_heartbeat')
      .eq('agent_name', agentName)
      .limit(1)
      .maybeSingle();

    if (agentError || !agentData) {
      await createAuditLog({ 
        supabase: supabaseAdmin, 
        userId: user.id, 
        tenantId: userRole?.tenant_id || 'unknown', 
        action: 'job_creation_denied', 
        resourceType: 'job', 
        details: { 
          reason: 'agent_not_found',
          agent_name: agentName 
        }, 
        request: req, 
        success: false 
      });

      return new Response(
        JSON.stringify({ 
          error: {
            code: 'AGENT_NOT_FOUND',
            message: 'Agente nao encontrado.'
          }
        }), 
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if agent is online (heartbeat within last 2 hours)
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const isAgentOnline = agentData.status === 'active' && 
      agentData.last_heartbeat && 
      new Date(agentData.last_heartbeat) > new Date(Date.now() - TWO_HOURS_MS);
    
    // BLOCK job creation for agents offline >2h (except update_agent and reinstall_agent which may recover them)
    const exemptTypes = ['update_agent', 'reinstall_agent'];
    if (!isAgentOnline && !exemptTypes.includes(type)) {
      const lastHeartbeat = agentData.last_heartbeat 
        ? new Date(agentData.last_heartbeat).toISOString() 
        : 'never';
      
      await createAuditLog({ 
        supabase: supabaseAdmin, 
        userId: user.id, 
        tenantId: agentData.tenant_id || userRole?.tenant_id || 'unknown', 
        action: 'job_creation_blocked_offline', 
        resourceType: 'job', 
        details: { 
          reason: 'agent_offline_2h',
          agent_name: agentName,
          last_heartbeat: lastHeartbeat,
          job_type: type
        }, 
        request: req, 
        success: false 
      });

      return new Response(
        JSON.stringify({ 
          error: {
            code: 'AGENT_OFFLINE',
            message: `Agente '${agentName}' está offline há mais de 2 horas (último heartbeat: ${lastHeartbeat}). Não é possível criar jobs para agentes inacessíveis.`
          }
        }), 
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agentOfflineWarning = !isAgentOnline 
      ? `Agent '${agentName}' may be slow to respond. Job will expire in 4 hours if not claimed.` 
      : null;

    // Usar tenant_id do agente ou do user_role
    const effectiveTenantId = agentData.tenant_id || userRole?.tenant_id;

    if (!effectiveTenantId) {
      await createAuditLog({ 
        supabase: supabaseAdmin, 
        userId: user.id, 
        tenantId: 'unknown', 
        action: 'job_creation_denied', 
        resourceType: 'job', 
        details: { 
          reason: 'tenant_not_found',
          user_role: userRole,
          is_super_admin: hasSuperAdminRole
        }, 
        request: req, 
        success: false 
      });

      return new Response(
        JSON.stringify({ 
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'Tenant nao encontrado.'
          }
        }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se usuario tem acesso ao tenant do agente (exceto super_admin)
    if (!hasSuperAdminRole && userRole?.tenant_id !== agentData.tenant_id) {
      return new Response(
        JSON.stringify({ 
          error: {
            code: 'FORBIDDEN',
            message: 'Agente pertence a outro tenant.'
          }
        }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate next_run_at for recurring jobs
    let nextRunAt = null;
    if (isRecurring && recurrencePattern) {
      const { data: nextRunData } = await supabaseAdmin.rpc('calculate_next_run', {
        pattern: recurrencePattern,
        from_time: new Date().toISOString()
      });
      nextRunAt = nextRunData;
    }

    // Prepare job data - INCLUINDO agent_id, payload completo e expires_at
    const DEFAULT_TTL_HOURS = 4;
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_HOURS * 60 * 60 * 1000).toISOString();
    
    console.log(`[create-job] Creating job with payload:`, JSON.stringify(effectivePayload));

    // Use dedup RPC for non-recurring/non-scheduled jobs to prevent idx_jobs_dedup_active violations
    // For scheduled/recurring jobs, use direct insert as they have unique scheduling params
    let job: any;
    
    if (!scheduledAt && !isRecurring) {
      // Use atomic dedup guard
      const { data: newJobId, error: rpcError } = await supabaseAdmin.rpc('create_job_if_not_exists', {
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
          JSON.stringify({
            error: {
              code: 'JOB_ALREADY_EXISTS',
              message: `Já existe um job ativo do tipo '${type}' para o agente '${agentName}'.`
            }
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch created job
      const { data: fetchedJob, error: fetchError } = await supabaseAdmin
        .from('jobs')
        .select('*')
        .eq('id', newJobId)
        .single();

      if (fetchError) throw fetchError;
      job = fetchedJob;
    } else {
      // Scheduled/recurring jobs use direct insert
      const jobData: any = {
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

      const { data: insertedJob, error: insertError } = await supabaseAdmin
        .from('jobs')
        .insert(jobData)
        .select()
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (insertError) throw insertError;
      job = insertedJob;
    }

    const DEFAULT_TTL_HOURS_DISPLAY = DEFAULT_TTL_HOURS;

    await createAuditLog({ 
      supabase: supabaseAdmin, 
      userId: user.id,
      tenantId: effectiveTenantId,
      action: 'job_created', 
      resourceType: 'job', 
      resourceId: job.id, 
      details: { 
        agent_name: agentName, 
        type, 
        approved,
        scheduled_at: scheduledAt,
        is_recurring: isRecurring,
        recurrence_pattern: recurrencePattern,
        resolved_tenant_via: hasSuperAdminRole && !userRole?.tenant_id ? 'agent_lookup' : 'user_role'
      }, 
      request: req, 
      success: true 
    });

    return new Response(
      JSON.stringify({ 
        id: job.id, 
        type: job.type, 
        agentName: job.agent_name,
        scheduledAt: job.scheduled_at,
        isRecurring: job.is_recurring,
        nextRunAt: job.next_run_at,
        expiresAt: job.expires_at,
        warning: agentOfflineWarning,
      }), 
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'create-job');
  }
});
