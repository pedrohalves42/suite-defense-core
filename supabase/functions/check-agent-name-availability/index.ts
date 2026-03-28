/**
 * Check Agent Name Availability - Migrated to serveTenant middleware
 * Checks if an agent name is available within the user's tenant.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const AgentNameSchema = z.object({
  agentName: z.string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(50, 'Nome deve ter no maximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Nome pode conter apenas letras, numeros, hifen e underscore'),
});

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;

  const parsed = AgentNameSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message || 'Invalid agent name';
    return { available: false, reason: firstError };
  }

  const { agentName } = parsed.data;

  logger.info('Checking agent name availability', { agentName, tenantId, requestId });

  const { data: existingAgent, error } = await supabase
    .from('agents')
    .select('id')
    .eq('agent_name', agentName)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.error('Error checking agent name', { error: error.message, agentName, tenantId });
    return new Response(
      JSON.stringify({ available: false, reason: 'Erro ao verificar disponibilidade do nome' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const isAvailable = !existingAgent;
  logger.info('Agent name check result', { agentName, tenantId, isAvailable });

  return {
    available: isAvailable,
    reason: existingAgent ? 'Nome ja esta em uso neste tenant' : null,
  };
}, { methods: ['POST'] });
