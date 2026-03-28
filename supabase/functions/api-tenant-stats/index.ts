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

  const rateLimitResult = await checkRateLimit(supabase, authResult.apiKeyId!, 'api-tenant-stats', {
    maxRequests: 100, windowMinutes: 1, blockMinutes: 5,
  });
  if (!rateLimitResult.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rateLimitResult.resetAt }), { status: 429 });
  }

  if (!hasScope(authResult.scopes!, 'read')) {
    return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 });
  }

  const tenantId = authResult.tenantId!;

  const [agents, scans, quarantine, jobs] = await Promise.all([
    supabase.from('agents').select('status, last_heartbeat').eq('tenant_id', tenantId).limit(1000),
    supabase.from('virus_scans').select('is_malicious').eq('tenant_id', tenantId).limit(1000),
    supabase.from('quarantined_files').select('status').eq('tenant_id', tenantId).limit(1000),
    supabase.from('jobs').select('status').eq('tenant_id', tenantId).limit(1000),
  ]);

  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const activeAgents = agents.data?.filter(a =>
    a.status === 'active' && a.last_heartbeat && new Date(a.last_heartbeat) > thirtyMinAgo
  ).length || 0;

  const stats = {
    agents: { total: agents.data?.length || 0, active: activeAgents, offline: (agents.data?.length || 0) - activeAgents },
    scans: { total: scans.data?.length || 0, malicious: scans.data?.filter(s => s.is_malicious).length || 0, clean: scans.data?.filter(s => !s.is_malicious).length || 0 },
    quarantine: { total: quarantine.data?.length || 0, quarantined: quarantine.data?.filter(q => q.status === 'quarantined').length || 0, restored: quarantine.data?.filter(q => q.status === 'restored').length || 0 },
    jobs: { total: jobs.data?.length || 0, completed: jobs.data?.filter(j => j.status === 'completed').length || 0, pending: jobs.data?.filter(j => j.status === 'queued' || j.status === 'delivered').length || 0, failed: jobs.data?.filter(j => j.status === 'failed').length || 0 },
    timestamp: new Date().toISOString(),
  };

  const responseTimeMs = Date.now() - startTime;
  await logApiRequest(supabase, {
    apiKeyId: authResult.apiKeyId!, tenantId: authResult.tenantId!,
    endpoint: '/api/tenant/stats', method: req.method,
    statusCode: 200, responseTimeMs,
    ipAddress: req.headers.get('x-forwarded-for') || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  });

  return stats;
}, { methods: ['GET', 'POST'] });
