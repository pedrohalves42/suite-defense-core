import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { AutoGenerateEnrollmentSchema } from '../_shared/validation.ts';
import { handleException, handleValidationError } from '../_shared/error-handler.ts';
import { logSecurityEvent, extractIpAddress, checkIpBlocklist } from '../_shared/security-log.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { withAPM } from '../_shared/apm.ts';
import { generateEnrollmentKey, sha256Hex, generateHmacSecret, validateHmacSecret } from './key-generator.ts';
import { resolveOrCreateAgent, createAgentToken, linkEnrollmentKey } from './agent-manager.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  return withAPM('auto-generate-enrollment', 'edge_function', async () => {
    try {
      return await withTimeout(async () => await handleRequest(req, requestId, startTime, origin), {
        timeoutMs: 25000,
        timeoutMessage: 'Auto-generate enrollment request timeout'
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        logger.error('Request timeout in auto-generate-enrollment', { requestId });
        return createTimeoutResponse(buildCorsHeaders(origin));
      }
      throw error;
    }
  }, { metadata: { request_id: requestId } });
});

async function handleRequest(req: Request, requestId: string, startTime: number, origin: string | null) {
  logger.info(`[${requestId}] ========== REQUEST START ==========`);
  logger.info(`[${requestId}] Method: ${req.method}, URL: ${req.url}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  // Health check
  if (req.method === 'GET') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const healthy = !!(supabaseUrl && supabaseKey);
    return new Response(
      JSON.stringify({ status: healthy ? 'healthy' : 'unhealthy', timestamp: new Date().toISOString(), service: 'auto-generate-enrollment', checks: { env_vars: healthy, supabase_url: !!supabaseUrl, service_role_key: !!supabaseKey } }),
      { status: healthy ? 200 : 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed', message: `HTTP ${req.method} is not supported. Use POST for enrollment or GET for health checks.`, timestamp: new Date().toISOString() }),
      { status: 405, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json', 'Allow': 'GET, POST, OPTIONS' } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseKey) {
      logger.error(`[${requestId}] CRITICAL: Missing environment variables`);
      return new Response(JSON.stringify({ error: 'Server configuration error', requestId, timestamp: new Date().toISOString() }), {
        status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const ipAddress = extractIpAddress(req);

    // IP blocklist check (non-blocking)
    try {
      const ipBlockCheck = await checkIpBlocklist(supabase, ipAddress, 'auto-generate-enrollment', 60);
      if (ipBlockCheck.blocked) {
        await logSecurityEvent({ supabase, ipAddress, endpoint: 'auto-generate-enrollment', attackType: 'brute_force', severity: 'high', blocked: true, details: { reason: ipBlockCheck.reason, resetAt: ipBlockCheck.resetAt }, userAgent: req.headers.get('user-agent') || undefined, requestId });
        return new Response(JSON.stringify({ error: 'Too many requests', message: ipBlockCheck.reason, resetAt: ipBlockCheck.resetAt, requestId, timestamp: new Date().toISOString() }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    } catch (blocklistError: Record<string, unknown>) {
      logger.warn(`[${requestId}] IP blocklist check failed (non-blocking)`, blocklistError.message);
    }

    // Rate limiting (non-blocking)
    try {
      const rateLimitResult = await checkRateLimit(supabase, ipAddress, 'auto-generate-enrollment', { maxRequests: 20, windowMinutes: 1, blockMinutes: 2 });
      if (!rateLimitResult.allowed) {
        await logSecurityEvent({ supabase, ipAddress, endpoint: 'auto-generate-enrollment', attackType: 'rate_limit', severity: 'medium', blocked: true, details: { resetAt: rateLimitResult.resetAt }, userAgent: req.headers.get('user-agent') || undefined, requestId });
        return new Response(JSON.stringify({ error: 'Rate limit exceeded', message: 'Too many enrollment key creation attempts. Please wait 2 minutes and try again.', resetAt: rateLimitResult.resetAt, requestId, timestamp: new Date().toISOString() }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
    } catch (rateLimitError: Record<string, unknown>) {
      logger.warn(`[${requestId}] Rate limit check failed (non-blocking)`, rateLimitError.message);
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required', message: 'Authorization header is missing.', requestId, timestamp: new Date().toISOString() }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication', message: authError?.message || 'Your session has expired.', requestId, timestamp: new Date().toISOString() }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // Parse body
    let body;
    try {
      body = await req.json();
    } catch (parseError: Record<string, unknown>) {
      return new Response(JSON.stringify({ error: 'Invalid request body', message: 'Request body must be valid JSON', details: parseError.message, requestId, timestamp: new Date().toISOString() }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // Validate
    const validation = AutoGenerateEnrollmentSchema.safeParse(body);
    if (!validation.success) {
      await logSecurityEvent({ supabase, tenantId: undefined, userId: user.id, ipAddress, endpoint: 'auto-generate-enrollment', attackType: 'invalid_input', severity: 'medium', blocked: true, details: { errors: validation.error.issues, input: body }, userAgent: req.headers.get('user-agent') || undefined, requestId });
      return handleValidationError(validation.error, undefined, requestId);
    }

    const { agentName, platform } = validation.data;

    // Generate credentials
    const enrollmentKey = generateEnrollmentKey();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const enrollmentKeyHash = await sha256Hex(enrollmentKey);
    const agentToken = crypto.randomUUID();
    const hmacSecret = generateHmacSecret();

    // Auto-validate HMAC (non-blocking)
    const hmacValid = await validateHmacSecret(hmacSecret, requestId);
    logger.info(`[${requestId}] HMAC secret auto-validation: ${hmacValid ? 'PASSED' : 'FAILED'}`);

    // Get tenant
    const { data: userRoles, error: roleError } = await supabase.from('user_roles').select('tenant_id, role').eq('user_id', user.id);
    if (roleError || !userRoles || userRoles.length === 0) {
      return new Response(JSON.stringify({ error: 'No tenant association', message: 'Your account is not associated with any organization.', requestId, timestamp: new Date().toISOString() }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    const adminRole = userRoles.find(r => r.role === 'admin');
    const tenantId = adminRole?.tenant_id || userRoles[0].tenant_id;

    // Store enrollment key (hash only - SEC-001)
    const { error: keyError } = await supabase.from('enrollment_keys').insert({ key_hash: enrollmentKeyHash, tenant_id: tenantId, created_by: user.id, expires_at: expiresAt.toISOString(), max_uses: 1, current_uses: 0, is_active: true, description: `Auto-generated for ${agentName}` });
    if (keyError) {
      if (keyError.code === '23505') throw new Error('Enrollment key already exists. Please try again.');
      throw new Error(`Failed to create enrollment key: ${keyError.message}`);
    }

    // Resolve or create agent
    const agentResult = await resolveOrCreateAgent({ supabase, requestId, userId: user.id, tenantId, agentName, platform, hmacSecret, ipAddress, origin });
    if (agentResult.error) return agentResult.error;
    const agentId = agentResult.agentId;

    // Create agent token
    await createAgentToken(supabase, agentId, agentToken, requestId);

    // Link enrollment key
    await linkEnrollmentKey(supabase, enrollmentKeyHash, agentId, agentName, requestId);

    // Fetch installer hash
    const { data: enrollmentData } = await supabase.from('enrollment_keys').select('installer_sha256, installer_size_bytes').eq('key', enrollmentKey).maybeSingle();

    const duration = Date.now() - startTime;
    logger.success(`[${requestId}] Successfully generated credentials for agent ${agentName} in ${duration}ms`);
    
    return new Response(
      JSON.stringify({ enrollmentKey, agentToken, hmacSecret, expiresAt: expiresAt.toISOString(), tokenExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), agentId, installerSha256: enrollmentData?.installer_sha256 || null, installerSizeBytes: enrollmentData?.installer_size_bytes || null, requestId, timestamp: new Date().toISOString() }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  } catch (error: Record<string, unknown>) {
    const duration = Date.now() - startTime;
    logger.error(`[${requestId}] Unexpected error after ${duration}ms: ${error.message}`);
    return new Response(JSON.stringify({ error: 'Internal server error', message: error.message || 'An unexpected error occurred.', requestId, timestamp: new Date().toISOString() }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
}
