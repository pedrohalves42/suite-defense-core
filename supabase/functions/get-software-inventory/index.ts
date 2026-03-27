import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  // Extrair agent_id da URL
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agent_id');

  if (!agentId) {
    return new Response(
      JSON.stringify({ error: 'agent_id parameter required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verificar que agente pertence ao tenant do usuario
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .select('id, agent_name, tenant_id')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (agentError || !agent) {
    return new Response(
      JSON.stringify({ error: 'Agent not found or access denied' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Fetching software inventory for agent ${agent.agent_name}`);

  // Buscar inventario
  const { data: inventory, error: inventoryError } = await supabase
    .from('software_inventory')
    .select('*')
    .eq('agent_id', agentId)
    .order('name', { ascending: true });

  if (inventoryError) {
    logger.error(`[${requestId}] Failed to fetch software inventory`, inventoryError);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch inventory' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Inventory fetched: ${inventory?.length || 0} items`);

  return {
    success: true,
    agent_id: agentId,
    agent_name: agent.agent_name,
    items: inventory || [],
  };
}, { methods: ['GET', 'POST'] });
