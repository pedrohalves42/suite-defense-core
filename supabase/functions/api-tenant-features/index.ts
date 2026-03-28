import { servePublic } from '../_shared/serve-tenant.ts';
import { authenticateApiKey, logApiRequest, hasScope } from '../_shared/api-auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();

  const apiKey = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), { status: 401 });
  }

  const authResult = await authenticateApiKey(apiKey, 
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (!authResult.success) {
    return new Response(JSON.stringify({ error: authResult.error }), { status: 401 });
  }

  const rateLimitResult = await checkRateLimit(supabase, authResult.apiKeyId!, 'api-tenant-features', {
    maxRequests: 100, windowMinutes: 1, blockMinutes: 5,
  });
  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rateLimitResult.resetAt }), { status: 429 });
  }

  if (!hasScope(authResult.scopes!, 'read')) {
    return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 });
  }

  const { data: features, error } = await supabase
    .from('tenant_features')
    .select('feature_key, enabled, quota_limit, quota_used, metadata')
    .eq('tenant_id', authResult.tenantId!)
    .order('feature_key');

  if (error) throw error;

  const responseTimeMs = Date.now() - startTime;
  await logApiRequest(supabase, {
    apiKeyId: authResult.apiKeyId!, tenantId: authResult.tenantId!,
    endpoint: '/api/tenant/features', method: req.method,
    statusCode: 200, responseTimeMs,
    ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  });

  return { features };
}, { methods: ['GET', 'POST'] });
