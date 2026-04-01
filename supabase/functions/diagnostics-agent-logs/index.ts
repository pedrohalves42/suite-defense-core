/**
 * diagnostics-agent-logs Edge Function
 * 
 * Receives diagnostic logs from agents and stores in installation_analytics.
 * 
 * Migrated to serveAgent middleware (Phase 2, Step 2.4)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const DiagnosticLogsSchema = z.object({
  logs: z.union([z.string().max(50000), z.array(z.string().max(5000)).max(500)]),
  log_type: z.string().min(1).max(100).optional(),
  severity: z.enum(['info', 'warning', 'error', 'critical']).optional(),
  timestamp: z.string().max(50).optional(),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;

  const parsed = DiagnosticLogsSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { logs, log_type, severity, timestamp } = parsed.data;

  // Save logs to installation_analytics for tracking
  const { error: insertError } = await supabase
    .from('installation_analytics')
    .insert({
      tenant_id: tenantId,
      agent_id: agentId,
      agent_name: agentName,
      event_type: 'agent_diagnostic_log',
      platform: 'windows',
      success: severity !== 'error',
      metadata: {
        log_type,
        severity,
        logs: Array.isArray(logs) ? logs : [logs],
        uploaded_at: timestamp || new Date().toISOString()
      }
    });

  if (insertError) {
    logger.error('Failed to save agent logs', insertError);
    return new Response(
      JSON.stringify({ error: 'Failed to save logs' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info('Agent logs received', { 
    agentName, 
    logType: log_type,
    severity 
  });

  return { ok: true, message: 'Logs received', agent: agentName };
});
