import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { AutoGenerateEnrollmentSchema } from '../_shared/validation.ts';
import { handleException, handleValidationError } from '../_shared/error-handler.ts';
import { logSecurityEvent, extractIpAddress, checkIpBlocklist } from '../_shared/security-log.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint - ANY GET request is treated as health check
  if (req.method === 'GET') {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      const healthy = !!(supabaseUrl && supabaseKey);
      
      return new Response(
        JSON.stringify({
          status: healthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          service: 'auto-generate-enrollment',
          checks: {
            env_vars: healthy,
            supabase_url: !!supabaseUrl,
            service_role_key: !!supabaseKey
          }
        }),
        {
          status: healthy ? 200 : 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error'
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  // Method validation - only POST is allowed for enrollment operations
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        error: 'Method not allowed',
        message: `HTTP ${req.method} is not supported. Use POST for enrollment or GET for health checks.`,
        timestamp: new Date().toISOString()
      }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Allow': 'GET, POST, OPTIONS' },
      }
    );
  }

  // Top-level try-catch to ensure CORS headers are always returned
  try {
    logger.info(`[${requestId}] Starting auto-generate-enrollment request`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      logger.error(`[${requestId}] Missing environment variables`, { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey });
      return new Response(JSON.stringify({ 
        error: 'Server configuration error',
        requestId 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    logger.debug(`[${requestId}] Supabase client initialized`);

    // Extract IP address for security logging and rate limiting
    const ipAddress = extractIpAddress(req);

    // Check if IP is in blocklist (non-blocking for better UX)
    try {
      const ipBlockCheck = await checkIpBlocklist(supabase, ipAddress, 'auto-generate-enrollment', 60);
      if (ipBlockCheck.blocked) {
        await logSecurityEvent({
          supabase,
          ipAddress,
          endpoint: 'auto-generate-enrollment',
          attackType: 'brute_force',
          severity: 'high',
          blocked: true,
          details: {
            reason: ipBlockCheck.reason,
            resetAt: ipBlockCheck.resetAt
          },
          userAgent: req.headers.get('user-agent') || undefined,
          requestId
        });

        return new Response(JSON.stringify({ 
          error: 'Too many requests',
          message: ipBlockCheck.reason,
          resetAt: ipBlockCheck.resetAt,
          requestId,
          timestamp: new Date().toISOString()
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (blocklistError: any) {
      logger.warn(`[${requestId}] IP blocklist check failed (non-blocking)`, blocklistError.message);
      // Continue - blocklist issues shouldn't block enrollment
    }

    // Rate limiting por IP (prevenir brute force)
    try {
      const rateLimitResult = await checkRateLimit(supabase, ipAddress, 'auto-generate-enrollment', {
        maxRequests: 10, // Máximo 10 enrollment keys por IP por hora
        windowMinutes: 60,
        blockMinutes: 120, // Bloquear por 2 horas se exceder
      });

      if (!rateLimitResult.allowed) {
        await logSecurityEvent({
          supabase,
          ipAddress,
          endpoint: 'auto-generate-enrollment',
          attackType: 'rate_limit',
          severity: 'medium',
          blocked: true,
          details: {
            resetAt: rateLimitResult.resetAt
          },
          userAgent: req.headers.get('user-agent') || undefined,
          requestId
        });

        return new Response(
          JSON.stringify({ 
            error: 'Rate limit exceeded',
            message: 'Too many enrollment key creation attempts. Please try again later.',
            resetAt: rateLimitResult.resetAt,
            requestId,
            timestamp: new Date().toISOString()
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (rateLimitError: any) {
      logger.error(`[${requestId}] Rate limit check failed`, rateLimitError.message);
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit check failed',
          message: rateLimitError.message || 'Unable to verify rate limit',
          requestId,
          timestamp: new Date().toISOString()
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    logger.debug(`[${requestId}] Auth header present:`, !!authHeader);
    
    if (!authHeader) {
      logger.warn(`[${requestId}] Missing Authorization header`);
      return new Response(JSON.stringify({ 
        error: 'Authentication required',
        message: 'Authorization header is missing. Please log in again.',
        requestId,
        timestamp: new Date().toISOString()
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    logger.debug(`[${requestId}] User auth result`, { userId: user?.id, hasError: !!authError });
    
    if (authError || !user) {
      logger.warn(`[${requestId}] Authentication failed`, authError);
      return new Response(JSON.stringify({ 
        error: 'Invalid authentication',
        message: authError?.message || 'Your session has expired. Please log in again.',
        requestId,
        timestamp: new Date().toISOString()
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body;
    try {
      body = await req.json();
      logger.debug(`[${requestId}] Request body parsed`, { agentName: body?.agentName || 'MISSING' });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Invalid JSON';
      logger.error(`[${requestId}] Invalid JSON in request body`, e);
      return handleValidationError('Invalid JSON in request body', { error: errorMsg }, requestId);
    }

    // Validate input with Zod
    const validation = AutoGenerateEnrollmentSchema.safeParse(body);
    
    if (!validation.success) {
      logger.warn(`[${requestId}] Validation failed`, {
        errors: validation.error.issues,
        receivedData: { agentName: body?.agentName || 'missing' }
      });
      
      // Log security event for invalid input
      await logSecurityEvent({
        supabase,
        tenantId: undefined,
        userId: user.id,
        ipAddress,
        endpoint: 'auto-generate-enrollment',
        attackType: 'invalid_input',
        severity: 'medium',
        blocked: true,
        details: {
          errors: validation.error.issues,
          input: body
        },
        userAgent: req.headers.get('user-agent') || undefined,
        requestId
      });
      
      return handleValidationError(validation.error, undefined, requestId);
    }

    const { agentName } = validation.data;
    logger.info(`[${requestId}] Valid agent name`, { agentName });

    // Generate enrollment key
    const generateKey = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const segments = 4;
      const segmentLength = 4;
      const parts = [];
      for (let i = 0; i < segments; i++) {
        let segment = '';
        for (let j = 0; j < segmentLength; j++) {
          segment += chars[Math.floor(Math.random() * chars.length)];
        }
        parts.push(segment);
      }
      return parts.join('-');
    };

    const enrollmentKey = generateKey();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Get user's tenant - prefer admin role, then any role
    logger.debug(`[${requestId}] Fetching tenant for user`, { userId: user.id });
    const { data: userRoles, error: roleError } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id);

    logger.debug(`[${requestId}] User roles fetched`, { 
      rolesCount: userRoles?.length, 
      hasError: !!roleError 
    });

    if (roleError || !userRoles || userRoles.length === 0) {
      logger.error(`[${requestId}] User has no tenant association`, { userId: user.id, roleError });
      return new Response(JSON.stringify({ 
        error: 'No tenant association',
        message: 'Your account is not associated with any organization. Please contact your administrator.',
        details: roleError?.message,
        requestId,
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prefer admin role, otherwise use first available tenant
    const adminRole = userRoles.find(r => r.role === 'admin');
    const tenantId = adminRole?.tenant_id || userRoles[0].tenant_id;
    
    logger.info(`[${requestId}] Tenant selected`, { 
      tenantId, 
      isAdmin: !!adminRole,
      totalRoles: userRoles.length 
    });

    // Create enrollment key
    logger.debug(`[${requestId}] Creating enrollment key`, { enrollmentKey });
    const { error: keyError } = await supabase
      .from('enrollment_keys')
      .insert({
        key: enrollmentKey,
        tenant_id: tenantId,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: 1,
        current_uses: 0,
        is_active: true,
        description: `Auto-generated for ${agentName}`,
      });

    if (keyError) {
      logger.error(`[${requestId}] Failed to create enrollment key`, keyError);
      
      // Map known DB errors
      if (keyError.code === '23505') { // Unique violation
        throw new Error('Enrollment key already exists. This is unexpected. Please try again.');
      }
      
      throw new Error(`Failed to create enrollment key: ${keyError.message}`);
    }
    
    logger.success(`[${requestId}] Enrollment key created successfully`);

    // Generate agent token and HMAC secret
    const agentToken = crypto.randomUUID();
    const hmacSecret = crypto.randomUUID();

    // Check if agent exists
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', agentName)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    let agentId: string;

    if (existingAgent) {
      agentId = existingAgent.id;
      logger.info(`[${requestId}] Re-enrolling existing agent`, { agentId });
      
      // Update HMAC secret for security
      const { error: updateError } = await supabase
        .from('agents')
        .update({ hmac_secret: hmacSecret })
        .eq('id', agentId);
      
      if (updateError) {
        logger.error(`[${requestId}] Failed to update HMAC secret`, updateError);
        throw updateError;
      }

      // Deactivate old tokens
      const { error: deactivateError } = await supabase
        .from('agent_tokens')
        .update({ is_active: false })
        .eq('agent_id', agentId);
        
      if (deactivateError) {
        logger.warn(`[${requestId}] Failed to deactivate old tokens`, deactivateError);
      }
    } else {
      // Create new agent
      logger.info(`[${requestId}] Creating new agent`, { agentName });
      const { data: newAgent, error: agentError } = await supabase
        .from('agents')
        .insert({
          agent_name: agentName,
          tenant_id: tenantId,
          hmac_secret: hmacSecret,
          status: 'pending',
        })
        .select('id')
        .maybeSingle();

      if (agentError || !newAgent) {
        logger.error(`[${requestId}] Failed to create agent`, agentError);
        
        // Map known DB errors to user-friendly messages
        if (agentError?.code === '23505') { // Unique violation
          throw new Error(`Agent name "${agentName}" is already registered. Please choose a different name.`);
        }
        if (agentError?.code === '23502') { // Not null violation
          throw new Error('Missing required fields for agent creation. Please contact support.');
        }
        if (agentError?.code === '42703') { // Undefined column
          throw new Error('Database schema error. The agents table may be missing required columns. Please contact support.');
        }
        
        throw new Error(`Failed to create agent: ${agentError?.message || 'Unknown database error'}`);
      }
      agentId = newAgent.id;
    }

    // Create agent token
    const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    const { error: tokenError } = await supabase
      .from('agent_tokens')
      .insert({
        agent_id: agentId,
        token: agentToken,
        expires_at: tokenExpiresAt.toISOString(),
        is_active: true,
      });

    if (tokenError) {
      logger.error(`[${requestId}] Failed to create agent token`, tokenError);
      
      // Map known DB errors
      if (tokenError.code === '23505') {
        throw new Error('Agent token already exists. Please try again.');
      }
      
      throw new Error(`Failed to create agent token: ${tokenError.message}`);
    }

    // Link enrollment key to agent (trigger will handle the rest)
    const { error: linkError } = await supabase
      .from('enrollment_keys')
      .update({ 
        agent_id: agentId,
        used_by_agent: agentName,
        used_at: new Date().toISOString()
      })
      .eq('key', enrollmentKey);
      
    if (linkError) {
      logger.warn(`[${requestId}] Failed to link enrollment key`, linkError);
    }

    const duration = Date.now() - startTime;
    logger.success(`[${requestId}] Credentials generated successfully in ${duration}ms`);
    
    return new Response(
      JSON.stringify({
        enrollmentKey,
        agentToken,
        hmacSecret,
        expiresAt: expiresAt.toISOString(),
        agentId,
        requestId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    // Catch all errors and ensure CORS headers are always included
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] Critical error after ${duration}ms`, error);
    
    // Extract detailed error information
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorDetails = error?.details || error?.hint || undefined;
    const errorCode = error?.code || undefined;
    
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: errorMessage,
        details: errorDetails,
        code: errorCode,
        requestId,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
