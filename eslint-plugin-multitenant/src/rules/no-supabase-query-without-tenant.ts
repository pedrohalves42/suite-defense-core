/**
 * ESLint Rule: no-supabase-query-without-tenant
 * 
 * Ensures all Supabase queries to multi-tenant tables use the tenantQuery()
 * helper or include explicit tenant_id filtering.
 * 
 * ADR-026: Active Tenant Isolation
 */

import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

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
  // ADR-026 FASE 2 - 7 additional tables with active_tenant policies
  'anomaly_events',
  'audit_reason_trees',
  'ai_action_validations',
  'antivirus_status',
  'custom_trials',
  'policy_assignments',
]);

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://docs.example.com/rules/${name}`
);

type MessageIds = 'missingTenantFilter' | 'useHelper';

export const noSupabaseQueryWithoutTenant = createRule<[], MessageIds>({
  name: 'no-supabase-query-without-tenant',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require tenant_id filtering for multi-tenant table queries',
    },
    messages: {
      missingTenantFilter:
        'Query to multi-tenant table "{{table}}" must include tenant_id filter. Use tenantQuery() helper instead.',
      useHelper:
        'Use tenantQuery("{{table}}", tenantId) instead of direct supabase.from() for multi-tenant tables.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    // Track if we're inside a tenantQuery call
    let inTenantQuery = false;
    
    return {
      // Detect tenantQuery() calls
      CallExpression(node: TSESTree.CallExpression) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'tenantQuery'
        ) {
          inTenantQuery = true;
        }
      },
      
      'CallExpression:exit'(node: TSESTree.CallExpression) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'tenantQuery'
        ) {
          inTenantQuery = false;
        }
      },

      // Detect supabase.from('table') calls
      'CallExpression[callee.property.name="from"]'(
        node: TSESTree.CallExpression
      ) {
        // Skip if we're inside tenantQuery
        if (inTenantQuery) return;

        // Check if this is supabase.from()
        const callee = node.callee as TSESTree.MemberExpression;
        if (callee.object.type !== 'Identifier') return;
        
        const objectName = callee.object.name;
        if (objectName !== 'supabase') return;

        // Get the table name from the first argument
        const firstArg = node.arguments[0];
        if (!firstArg || firstArg.type !== 'Literal') return;
        
        const tableName = String(firstArg.value);
        
        // Check if it's a multi-tenant table
        if (!MULTI_TENANT_TABLES.has(tableName)) return;

        // Check if the chain includes .eq('tenant_id', ...)
        let parent = node.parent;
        let hasTenantFilter = false;
        
        while (parent) {
          if (
            parent.type === 'CallExpression' &&
            parent.callee.type === 'MemberExpression' &&
            parent.callee.property.type === 'Identifier' &&
            parent.callee.property.name === 'eq'
          ) {
            const eqArgs = (parent as TSESTree.CallExpression).arguments;
            if (
              eqArgs[0]?.type === 'Literal' &&
              eqArgs[0].value === 'tenant_id'
            ) {
              hasTenantFilter = true;
              break;
            }
          }
          parent = parent.parent;
        }

        if (!hasTenantFilter) {
          context.report({
            node,
            messageId: 'useHelper',
            data: { table: tableName },
          });
        }
      },
    };
  },
});

export default noSupabaseQueryWithoutTenant;
