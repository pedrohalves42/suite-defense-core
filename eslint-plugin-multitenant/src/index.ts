/**
 * ESLint Plugin: Multi-Tenant Security
 * 
 * Enforces tenant isolation patterns in Supabase queries.
 * Part of ADR-026: Active Tenant Isolation implementation.
 */

import noSupabaseQueryWithoutTenant from './rules/no-supabase-query-without-tenant';

export = {
  rules: {
    'no-supabase-query-without-tenant': noSupabaseQueryWithoutTenant,
  },
  configs: {
    recommended: {
      plugins: ['multitenant'],
      rules: {
        'multitenant/no-supabase-query-without-tenant': 'error',
      },
    },
  },
};
