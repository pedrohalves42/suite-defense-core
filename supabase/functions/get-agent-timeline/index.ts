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

  logger.info(`[${requestId}] Fetching timeline for agent ${agent.agent_name}`);

  // Buscar eventos da view
  const { data: events, error: eventsError } = await supabase
    .from('agent_timeline_events')
    .select('*')
    .eq('agent_id', agentId)
    .order('event_time', { ascending: false })
    .limit(200);

  if (eventsError) {
    logger.error(`[${requestId}] Failed to fetch timeline events`, eventsError);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch timeline' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] Timeline fetched: ${events?.length || 0} events`);

  return {
    success: true,
    agent_id: agentId,
    agent_name: agent.agent_name,
    events: events || [],
  };
}, { methods: ['GET', 'POST'] });
