// @ts-nocheck
/**
 * submit-router -- Consolidated agent telemetry submission endpoint
 * 
 * Consolidates non-HMAC submit-* functions that use serveAgent middleware.
 * HMAC functions use submit-hmac-router instead.
 * 
 * Usage: POST /submit-router
 * Body: { "type": "backup-status" | "data-exposure" | "endpoint-events" | "network-info" | 
 *         "process-lineage" | "ransomware-indicator" | "agent-evidence" | "processes", ...payload }
 * Headers: X-Agent-Token
 * 
 * Auth: Agent token (X-Agent-Token via serveAgent, no HMAC required)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// Direct handlers
import { handleBackupStatus } from './handlers/backup-status.ts';
import { handleDataExposure } from './handlers/data-exposure.ts';
import { handleEndpointEvents } from './handlers/endpoint-events.ts';
import { handleNetworkInfo } from './handlers/network-info.ts';
import { handleProcessLineage } from './handlers/process-lineage.ts';
import { handleRansomwareIndicator } from './handlers/ransomware-indicator.ts';
import { handleAgentEvidence } from './handlers/agent-evidence.ts';
// Migrated from standalone submit-processes (non-HMAC)
import { handleProcesses } from '../_shared/submit-handlers/processes.ts';

const SubmitRouterSchema = z.object({
  type: z.string().min(1).max(50),
}); // Removido .passthrough() para evitar injeção de campos não validados (Correção F-002)

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
  'processes':            handleProcesses,
};

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;

  const parsed = SubmitRouterSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors, available: Object.keys(HANDLERS).filter(k => k.includes('-')) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const payload = parsed.data as Record<string, unknown>;
  const type = parsed.data.type;

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