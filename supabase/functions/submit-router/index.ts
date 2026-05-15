// @ts-nocheck
/**
 * submit-router -- Consolidated agent telemetry submission endpoint
 * 
 * Auth: Agent token (X-Agent-Token via serveAgent, no HMAC required)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { validateSubmit } from '../_shared/schemas/registry.ts'; // Correção F-002: Validador de perímetro
import { z } from 'https://esm.sh/zod@3.23.8';

// Direct handlers
import { handleBackupStatus } from './handlers/backup-status.ts';
import { handleDataExposure } from './handlers/data-exposure.ts';
import { handleEndpointEvents } from './handlers/endpoint-events.ts';
import { handleNetworkInfo } from './handlers/network-info.ts';
import { handleProcessLineage } from './handlers/process-lineage.ts';
import { handleRansomwareIndicator } from './handlers/ransomware-indicator.ts';
import { handleAgentEvidence } from './handlers/agent-evidence.ts';
import { handleProcesses } from '../_shared/submit-handlers/processes.ts';

const HANDLERS: Record<string, any> = {
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

  // 1. Validação estrita do campo de controle 'type'
  const typeValidation = z.object({
    type: z.string().min(1).max(50),
  }).safeParse(body);

  if (!typeValidation.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid payload: missing or invalid "type"' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  
  const type = typeValidation.data.type;

  // 2. Validação profunda do payload via Registry (F-002)
  let validatedPayload: any;
  try {
    validatedPayload = validateSubmit(type, body);
  } catch (validationErr) {
    return new Response(
      JSON.stringify({ error: `Validation failed for type ${type}: ${validationErr.message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const handler = HANDLERS[type];
  if (!handler) {
    return new Response(
      JSON.stringify({ error: `Unknown submit type: ${type}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  logger.info(`[${requestId}] submit-router: type=${type} agent=${agentId}`);

  const result = await handler(supabase, agentId, agentName || '', tenantId, requestId, validatedPayload);
  if (result instanceof Response) return result;
  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
