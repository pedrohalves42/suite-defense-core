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
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Não autorizado', 401, requestId);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Buscar tenant_id do usuário autenticado primeiro
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Verificar se o usuário tem permissão (admin, operator ou super_admin)
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
            message: 'Acesso negado. Necessário ser admin, operator ou super_admin.'
          }
        }), 
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting por usuário (prevenir flooding de jobs)
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
    
    const { agentName, type, payload, approved, scheduledAt, isRecurring, recurrencePattern } = validation.data;

    // Resolve tenant context
    let effectiveTenantId = userRole?.tenant_id;

    // If super_admin without direct tenant mapping, derive from agent
    if (hasSuperAdminRole && !effectiveTenantId) {
      const { data: agentData, error: agentError } = await supabaseAdmin
        .from('agents')
        .select('tenant_id')
        .eq('agent_name', agentName)
        .limit(1)
        .maybeSingle();

      if (agentError || !agentData) {
        await createAuditLog({ 
          supabase: supabaseAdmin, 
          userId: user.id, 
          tenantId: 'unknown', 
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
              message: 'Agente não encontrado ou não pertence a nenhum tenant.'
            }
          }), 
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      effectiveTenantId = agentData.tenant_id;
    }

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
            message: 'Tenant não encontrado.'
          }
        }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Prepare job data
    const jobData: any = {
      agent_name: agentName, 
      type, 
      payload, 
      status: 'queued', 
      approved,
      tenant_id: effectiveTenantId,
      scheduled_at: scheduledAt || null,
      is_recurring: isRecurring,
      recurrence_pattern: recurrencePattern || null,
      next_run_at: nextRunAt
    };

    const { data: job, error: insertError } = await supabaseAdmin
      .from('jobs')
      .insert(jobData)
      .select()
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (insertError) throw insertError;

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
        nextRunAt: job.next_run_at
      }), 
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'create-job');
  }
});
