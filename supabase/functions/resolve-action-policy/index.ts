/**
 * resolve-action-policy — Migrated to serveTenant
 * Enterprise Policy Engine: single decision point for action policies.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface PolicyRequest {
  tenant_id: string;
  insight_type: string;
}

interface PolicyResponse {
  source: 'tenant_policy' | 'default_mapping' | 'tenant_fallback';
  execution_mode: 'auto' | 'approval' | 'disabled';
  policy_details?: {
    tenant_policy_id?: string;
    default_mapping_mode?: string;
    tenant_global_mode?: string;
  };
}

const DEFAULT_MAPPINGS: Record<string, 'auto' | 'approval'> = {
  security_threat: 'auto', anomaly_detection: 'auto', anomaly: 'auto',
  prediction: 'approval', root_cause: 'approval', optimization: 'approval',
  agent_improdutive: 'auto', agent_recovered: 'auto', integrity_violation: 'auto', info: 'auto',
  antivirus_disabled: 'auto', antivirus_outdated: 'auto', dns_malicious_activity: 'auto',
  agent_offline_suspicious: 'auto', agent_tampering: 'auto', anomaly_stuck_jobs: 'auto',
  job_failed_recurring: 'auto', blocked_access_detected: 'auto',
  vulnerability_critical: 'approval', vulnerability_high: 'approval',
  safe_mode_prolonged: 'approval', process_anomaly: 'approval',
  data_exfiltration_suspected: 'approval', unauthorized_software: 'approval',
};

serveTenant<PolicyRequest>(async (_req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;
  const { insight_type } = body;

  if (!insight_type) {
    return new Response(JSON.stringify({ error: 'Missing required fields', required: ['insight_type'] }), { status: 400 });
  }

  logger.info(`[${requestId}] Resolving policy for tenant=${tenantId}, insight_type=${insight_type}`);

  // 1. Tenant-specific policy
  const { data: tenantPolicy, error: policyError } = await supabase
    .from('tenant_action_policies').select('id, execution_mode')
    .eq('tenant_id', tenantId).eq('insight_type', insight_type).maybeSingle();

  if (policyError) throw policyError;

  if (tenantPolicy?.execution_mode) {
    await supabase.from('tenant_action_policies').update({ last_applied_at: new Date().toISOString() }).eq('id', tenantPolicy.id);
    logger.info(`[${requestId}] Using tenant policy: ${tenantPolicy.execution_mode}`);
    const response: PolicyResponse = {
      source: 'tenant_policy', execution_mode: tenantPolicy.execution_mode as 'auto' | 'approval' | 'disabled',
      policy_details: { tenant_policy_id: tenantPolicy.id },
    };
    return response;
  }

  // 2. Default mapping
  const defaultMode = DEFAULT_MAPPINGS[insight_type];
  if (defaultMode) {
    logger.info(`[${requestId}] Using default mapping: ${defaultMode}`);
    return { source: 'default_mapping', execution_mode: defaultMode, policy_details: { default_mapping_mode: defaultMode } } as PolicyResponse;
  }

  // 3. Tenant fallback
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants').select('auto_action_mode').eq('id', tenantId).single();

  if (tenantError) {
    return { source: 'tenant_fallback', execution_mode: 'approval' } as PolicyResponse;
  }

  let fallbackMode: 'auto' | 'approval' | 'disabled' = 'approval';
  if (tenant?.auto_action_mode === 'auto_full') fallbackMode = 'auto';
  else if (tenant?.auto_action_mode === 'disabled') fallbackMode = 'disabled';

  logger.info(`[${requestId}] Using tenant fallback: ${fallbackMode} (from ${tenant?.auto_action_mode})`);
  return { source: 'tenant_fallback', execution_mode: fallbackMode, policy_details: { tenant_global_mode: tenant?.auto_action_mode || 'suggest' } } as PolicyResponse;
});
