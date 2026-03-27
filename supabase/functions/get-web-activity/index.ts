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

  logger.info(`[${requestId}] Fetching web activity for agent ${agent.agent_name}`);

  // Buscar atividade web agregada das ultimas 24h
  const { data: activity, error: activityError } = await supabase
    .rpc('get_web_activity_aggregated', {
      p_agent_id: agentId,
      p_hours_back: 24
    });

  if (activityError) {
    // Fallback: buscar direto da tabela se RPC nao existir
    const { data: rawActivity, error: rawError } = await supabase
      .from('agent_web_activity')
      .select('domain, visited_at')
      .eq('agent_id', agentId)
      .gte('visited_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('visited_at', { ascending: false })
      .limit(200);

    if (rawError) {
      logger.error(`[${requestId}] Failed to fetch web activity`, rawError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch web activity' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Agregar manualmente
    const aggregated = new Map<string, { first: string; last: string; count: number }>();
    
    for (const item of rawActivity || []) {
      const existing = aggregated.get(item.domain);
      if (existing) {
        existing.last = item.visited_at;
        existing.count++;
      } else {
        aggregated.set(item.domain, {
          first: item.visited_at,
          last: item.visited_at,
          count: 1
        });
      }
    }

    const result = Array.from(aggregated.entries()).map(([domain, data]) => ({
      domain,
      first_seen_at: data.first,
      last_seen_at: data.last,
      hits: data.count
    }));

    return {
      success: true,
      agent_id: agentId,
      agent_name: agent.agent_name,
      items: result,
    };
  }

  logger.info(`[${requestId}] Web activity fetched: ${activity?.length || 0} domains`);

  return {
    success: true,
    agent_id: agentId,
    agent_name: agent.agent_name,
    items: activity || [],
  };
}, { methods: ['GET', 'POST'] });
