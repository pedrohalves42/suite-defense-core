/**
 * submit-network-info: Receives network configuration data from agents
 * Migrated to serveAgent middleware
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, tenantId, requestId, body } = ctx;
  const payload = body as Record<string, unknown>;

  // Insert network info
  const { error: insertError } = await supabase
    .from('agent_network_info')
    .insert({
      agent_id: agentId,
      tenant_id: tenantId,
      firewall_domain: payload.firewall_domain ?? null,
      firewall_private: payload.firewall_private ?? null,
      firewall_public: payload.firewall_public ?? null,
      open_ports: payload.open_ports || [],
      active_connections: (Array.isArray(payload.active_connections) ? payload.active_connections : []).slice(0, 100),
      network_adapters: payload.network_adapters || [],
      dns_servers: payload.dns_servers || [],
      gateway_ip: payload.gateway_ip ?? null,
      public_ip: payload.public_ip ?? null,
      dns_test_success: payload.dns_test_success ?? null,
      https_test_success: payload.https_test_success ?? null,
      collected_at: new Date().toISOString(),
    });

  if (insertError) {
    logger.error(`[${requestId}] Error inserting network info:`, insertError);
    return new Response(
      JSON.stringify({ error: 'Failed to save network info' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Clean up old records (keep last 7 days)
  await supabase
    .from('agent_network_info')
    .delete()
    .eq('agent_id', agentId)
    .lt('collected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

  logger.info(`[${requestId}] Network info saved for agent ${agentId}`);
  return { success: true };
});
