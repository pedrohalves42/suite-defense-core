/**
 * submit-router -- Consolidated agent telemetry submission endpoint
 *
 * Auth: Agent token (X-Agent-Token via serveAgent, no HMAC required)
 *
 * D5: Removed @ts-nocheck. Tipagem estrita do roteamento sem mudança de
 * runtime, contrato de agente, validação funcional ou persistência.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
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

// ─── Tipagem do roteamento ──────────────────────────────────────────────────
// Mantém exatamente as mesmas chaves do mapa original (kebab + snake), sem
// inventar tipos novos nem alterar o contrato exposto ao agente.
type SubmitHandler = (
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
) => Promise<Response | Record<string, unknown>>;

const HANDLERS = {
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
} as const satisfies Record<string, SubmitHandler>;

type SubmitKind = keyof typeof HANDLERS;

function isSubmitKind(value: string): value is SubmitKind {
  return Object.prototype.hasOwnProperty.call(HANDLERS, value);
}

const TypeSchema = z.object({
  type: z.string().min(1).max(50),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;

  // body chega como unknown vindo de serveAgent. Narrowing antes de validar.
  const rawBody: Record<string, unknown> =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};

  // 1. Validação estrita do campo de controle 'type'
  const typeValidation = TypeSchema.safeParse(rawBody);

  if (!typeValidation.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid payload: missing or invalid "type"' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const type = typeValidation.data.type;

  // 2. Validação profunda do payload via Registry (F-002)
  let validatedPayload: Record<string, unknown>;
  try {
    const parsed = validateSubmit(type, rawBody);
    validatedPayload =
      parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch (validationErr) {
    const message =
      validationErr instanceof Error ? validationErr.message : String(validationErr);
    return new Response(
      JSON.stringify({ error: `Validation failed for type ${type}: ${message}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Roteamento — só aceita chaves explícitas do mapa.
  if (!isSubmitKind(type)) {
    return new Response(
      JSON.stringify({ error: `Unknown submit type: ${type}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const handler: SubmitHandler = HANDLERS[type];

  logger.info(`[${requestId}] submit-router: type=${type} agent=${agentId}`);

  const result = await handler(
    supabase as SupabaseClient,
    agentId,
    agentName || '',
    tenantId,
    requestId,
    validatedPayload,
  );
  if (result instanceof Response) return result;
  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
