/**
 * agent-snapshot — Migrated to serveTenant
 * Retorna snapshot unico e consistente do agente.
 * Fonte unica de verdade para todas as UIs.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const AgentSnapshotSchema = z.object({
  agent_id: z.string().uuid('Invalid agent_id format'),
});

serveTenant(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  const parsed = AgentSnapshotSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors, correlation_id: requestId }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const { agent_id } = parsed.data;

  // Validation handled by Zod above

  const { data: snapshot, error: rpcError } = await supabase
    .rpc('get_agent_snapshot', { p_agent_id: agent_id });

  if (rpcError) {
    logger.error('[agent-snapshot][RPC_ERROR]', { rpcError, agent_id, correlationId: requestId });
    return new Response(
      JSON.stringify({ error: 'Failed to fetch agent snapshot', correlation_id: requestId }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!snapshot) {
    return new Response(
      JSON.stringify({ error: 'Agent not found or access denied', correlation_id: requestId }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return {
    data: {
      ...snapshot,
      meta: { correlation_id: requestId, snapshot_at: new Date().toISOString() },
    },
  };
}, {
  methods: ['POST'],
  skipTenantValidation: true,
});
