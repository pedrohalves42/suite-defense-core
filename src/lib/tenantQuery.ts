import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

/**
 * List of tables that require tenant isolation.
 * Any query to these tables MUST include a tenant_id filter.
 */
const MULTI_TENANT_TABLES = new Set([
  // Core tables
  'agents',
  'tasks',
  'system_alerts',
  'jobs',
  'ai_insights',
  'computers',
  // Agent metrics & activity
  'agent_web_activity',
  'agent_system_metrics',
  'agent_disk_metrics',
  'agent_network_info',
  'agent_builds',
  'agent_evidence_logs',
  'agent_rollback_events',
  'agent_safe_mode_events',
  // Security & governance
  'enrollment_keys',
  'security_policies',
  'governance_reports',
  'playbook_executions',
  'scheduled_jobs',
  'vuln_findings',
  'software_inventory',
  'user_roles',
  'tenant_features',
  'tenant_action_policies',
  'blocked_websites',
  // ADR-026 final closure - 15 additional tables
  'ai_action_logs',
  'api_keys',
  'api_request_logs',
  'compliance_policies',
  'failed_login_attempts',
  'quarantined_files',
  'report_executions',
  'reports',
  'security_logs',
  'soc2_controls',
  'soc2_criteria',
  'tenant_settings',
  'tenant_subscriptions',
  'vendor_risk_registry',
  'virus_scans',
]);

type TableName = keyof Database['public']['Tables'];

/**
 * Creates a Supabase query with mandatory tenant_id filtering for multi-tenant tables.
 * 
 * This wrapper ensures that queries to multi-tenant tables always include
 * the tenant_id filter, preventing cross-tenant data leakage.
 * 
 * @param table - The table name to query
 * @param tenantId - The tenant ID to filter by (required for multi-tenant tables)
 * @returns A Supabase query builder with tenant filter applied
 * @throws Error if tenantId is missing for a multi-tenant table
 * 
 * @example
 * // Safe query with tenant isolation
 * const { data } = await tenantQuery('agents', tenant.id)
 *   .select('*')
 *   .eq('status', 'active');
 */
export function tenantQuery<T extends TableName>(
  table: T,
  tenantId: string | undefined
) {
  const isMultiTenant = MULTI_TENANT_TABLES.has(table);

  if (isMultiTenant && !tenantId) {
    throw new Error(
      `[tenantQuery] tenant_id obrigatório para tabela "${table}". ` +
      `Use useTenant() ou useRequiredTenant() para obter o tenant ativo.`
    );
  }

  const query = supabase.from(table);

  // Apply tenant filter for multi-tenant tables
  if (isMultiTenant && tenantId) {
    return (query as any).eq('tenant_id', tenantId);
  }

  return query;
}

/**
 * Validates that a tenant ID is present before proceeding.
 * Returns early with an empty result if tenant is not available.
 * 
 * Use this in async query functions as a guard clause.
 * 
 * @param tenantId - The tenant ID to validate
 * @param tableName - The table name (for error messages)
 * @returns true if tenant is valid, false otherwise
 * 
 * @example
 * if (!validateTenantId(tenant?.id, 'agents')) return [];
 */
export function validateTenantId(
  tenantId: string | undefined,
  tableName: string
): tenantId is string {
  if (!tenantId) {
    console.warn(`[tenantQuery] Skipping query to "${tableName}" - no tenant selected`);
    return false;
  }
  return true;
}

/**
 * Checks if a table is multi-tenant.
 * Useful for conditional logic based on table type.
 */
export function isMultiTenantTable(table: string): boolean {
  return MULTI_TENANT_TABLES.has(table);
}
