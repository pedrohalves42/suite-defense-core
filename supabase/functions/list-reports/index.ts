/**
 * list-reports — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentName } = ctx;

  logger.info('Listando relatorios para agente:', agentName);

  const { data: reports } = await supabase
    .from('reports')
    .select('id, kind, file_path, created_at')
    .eq('agent_name', agentName)
    .order('created_at', { ascending: false })
    .limit(50);

  return (reports || []).map(r => ({
    id: r.id,
    kind: r.kind,
    file: r.file_path,
    createdUtc: r.created_at,
  }));
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'list-reports', maxRequests: 30, windowMinutes: 1, blockMinutes: 5 },
});
