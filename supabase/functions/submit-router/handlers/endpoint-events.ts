/**
 * Handler: endpoint events submission (EDR telemetry)
 * Extracted from submit-endpoint-events/index.ts
 * 
 * NOTE: This is a large handler (~300 lines) with MITRE ATT&CK detection rules.
 * For the router version, it proxies to the original function to avoid code duplication.
 * Future: inline the handler once the original function is removed.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

// This handler proxies to the original submit-endpoint-events function
// because it contains complex detection logic (15 MITRE rules, buffer pattern)
// that should not be duplicated.
export async function handleEndpointEvents(
  supabase: SupabaseClient,
  agentId: string,
  _agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  logger.info(`[${requestId}] submit-router: endpoint-events proxied for agent ${agentId}`);

  // Proxy to original function via internal invocation
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';

  const response = await fetch(`${SUPABASE_URL}/functions/v1/submit-endpoint-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': INTERNAL_SECRET,
      'X-Request-ID': requestId,
    },
    body: JSON.stringify({ ...body, _router_agent_id: agentId, _router_tenant_id: tenantId }),
  });

  const result = await response.text();
  try {
    return JSON.parse(result);
  } catch {
    return { success: response.ok, raw: result };
  }
}
