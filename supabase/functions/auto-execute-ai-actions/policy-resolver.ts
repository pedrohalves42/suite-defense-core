/**
 * Policy resolution and action filtering for auto-execute-ai-actions
 * Extraído de auto-execute-ai-actions/index.ts
 */
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

export interface PolicyResponse {
  execution_mode: 'auto' | 'approval' | 'disabled';
  source: 'tenant_policy' | 'default_mapping' | 'tenant_fallback';
  policy_details?: Record<string, any>;
}

/**
 * Resolve execution policy via the centralized resolve-action-policy function.
 */
export async function resolvePolicy(
  supabaseUrl: string,
  supabaseKey: string,
  tenantId: string,
  insightType: string,
  requestId: string,
): Promise<PolicyResponse> {
  try {
    const response = await fetchWithTimeout(
      `${supabaseUrl}/functions/v1/resolve-action-policy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
        body: JSON.stringify({ tenant_id: tenantId, insight_type: insightType }),
      }
    );

    if (!response.ok) {
      logger.error(`[${requestId}] Policy resolution failed: ${response.status}`);
      return { execution_mode: 'approval', source: 'tenant_fallback' };
    }

    return await response.json();
  } catch (err) {
    logger.error(`[${requestId}] Policy resolution error:`, err);
    return { execution_mode: 'approval', source: 'tenant_fallback' };
  }
}

/**
 * Checks if an action should be skipped based on config and policy.
 * Returns a reason string if skipped, null if action should proceed.
 */
export function shouldSkipAction(
  config: Record<string, any> | undefined,
  policy: PolicyResponse,
  requestId: string,
  actionId: string,
): string | null {
  if (!config || !config.is_enabled) return `action type not enabled`;
  if (config.requires_approval) return `requires manual approval (config)`;
  if (policy.execution_mode === 'disabled') return `disabled by policy (source=${policy.source})`;
  if (policy.execution_mode === 'approval') return `requires approval (source=${policy.source})`;
  if (config.risk_level === 'high') return `high risk action`;
  return null;
}
