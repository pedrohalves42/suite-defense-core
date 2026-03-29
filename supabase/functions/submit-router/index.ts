/**
 * submit-router -- Consolidated agent telemetry submission endpoint
 * 
 * Consolidates non-HMAC submit-* functions that use serveAgent middleware.
 * HMAC functions (submit-antivirus-status, submit-software-inventory, submit-system-metrics,
 * submit-web-activity, submit-vuln-findings, submit-rollback-event, submit-processes) 
 * remain standalone per MIGRATION_GUIDE.md (raw body required for HMAC verification).
 * 
 * Usage: POST /submit-router
 * Body: { "type": "backup-status" | "data-exposure" | "endpoint-events" | "network-info" | 
 *         "process-lineage" | "ransomware-indicator" | "agent-evidence", ...payload }
 * Headers: X-Agent-Token
 * 
 * Auth: Agent token (X-Agent-Token via serveAgent)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

// Direct handlers
import { handleBackupStatus } from './handlers/backup-status.ts';
import { handleDataExposure } from './handlers/data-exposure.ts';
import { handleEndpointEvents } from './handlers/endpoint-events.ts';
import { handleNetworkInfo } from './handlers/network-info.ts';
import { handleProcessLineage } from './handlers/process-lineage.ts';
import { handleRansomwareIndicator } from './handlers/ransomware-indicator.ts';
import { handleAgentEvidence } from './handlers/agent-evidence.ts';

type SubmitHandler = (
  supabase: import('https://esm.sh/@supabase/supabase-js@2.74.0').SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
) => Promise<Response | Record<string, unknown>>;

const HANDLERS: Record<string, SubmitHandler> = {
  'backup-status':        handleBackupStatus,
  'backup_status':        handleBackupStatus,
  'data-exposure':        handleDataExposure,
  'data_exposure':        handleDataExposure,
  'endpoint-events':      handleEndpointEvents,
  'endpoint_events':      handleEndpointEvents,
  'network-info':         handleNetworkInfo,
  'network_info':         handleNetworkInfo,
  'process-lineage':      handleProcessLineage,
  'process_lineage':      handleProcessLineage,
  'ransomware-indicator': handleRansomwareIndicator,
  'ransomware_indicator': handleRansomwareIndicator,
  'agent-evidence':       handleAgentEvidence,
  'agent_evidence':       handleAgentEvidence,
};

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const payload = body as Record<string, unknown>;
  const type = (payload.type as string) || '';

  if (!type) {
    return new Response(
      JSON.stringify({ error: 'Missing "type" field', available: Object.keys(HANDLERS).filter(k => k.includes('-')) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const handler = HANDLERS[type];
  if (!handler) {
    return new Response(
      JSON.stringify({ error: `Unknown submit type: ${type}`, available: Object.keys(HANDLERS).filter(k => k.includes('-')) }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  logger.info(`[${requestId}] submit-router: type=${type} agent=${agentId}`);

  const result = await handler(supabase, agentId, agentName || '', tenantId, requestId, payload);
  if (result instanceof Response) return result;
  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
