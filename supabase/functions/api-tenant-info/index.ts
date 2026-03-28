import { z } from 'https://esm.sh/zod@3.23.8';
import { servePublic } from '../_shared/serve-tenant.ts';
import { authenticateApiKey, logApiRequest } from '../_shared/api-auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';

const ApiKeySchema = z.string().min(32).max(256).regex(/^[a-zA-Z0-9_-]+$/);
const IpAddressSchema = z.string().max(45).optional().default('unknown');
const UserAgentSchema = z.string().max(512).optional().default('unknown');

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();

  const rawApiKey = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!rawApiKey) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), { status: 401 });
  }

  const apiKeyValidation = ApiKeySchema.safeParse(rawApiKey);
  if (!apiKeyValidation.success) {
    logger.warn('Invalid API key format received');
    return new Response(JSON.stringify({ error: 'Invalid API key format' }), { status: 401 });
  }

  const authResult = await authenticateApiKey(apiKeyValidation.data,
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  if (!authResult.success) {
    return new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 401 });
  }

  const rateLimitResult = await checkRateLimit(supabase, authResult.apiKeyId!, 'api-tenant-info', {
    maxRequests: 100, windowMinutes: 1, blockMinutes: 5,
  });
  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rateLimitResult.resetAt }), { status: 429 });
  }

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, name, slug, created_at, updated_at')
    .eq('id', authResult.tenantId!)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Database error in api-tenant-info:', error.message);
    throw new Error('Failed to fetch tenant info');
  }

  const responseTimeMs = Date.now() - startTime;
  const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ipAddress = IpAddressSchema.parse(rawIp);
  const userAgent = UserAgentSchema.parse(req.headers.get('user-agent')?.substring(0, 512));

  await logApiRequest(supabase, {
    apiKeyId: authResult.apiKeyId!, tenantId: authResult.tenantId!,
    endpoint: '/api/tenant/info', method: req.method,
    statusCode: 200, responseTimeMs, ipAddress, userAgent,
  });

  return tenant;
}, { methods: ['GET', 'POST'] });
