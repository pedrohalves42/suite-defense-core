import { test, expect } from '@playwright/test';
import { createAnonClient, getSupabaseUrl, getAnonKey, hasRequiredEnvVars } from '../utils/supabase';
import { auditLogsContract } from '../schemas/audit_logs.contract';
import { assertTableContract } from '../utils/schemaAssert';

/**
 * Contract tests for action-center-feed Edge Function
 * 
 * This function depends on:
 * - audit_logs table (must NOT have actor_type column)
 * - system_alerts table
 * - Proper tenant isolation
 */

test.describe('Edge Function Contract: action-center-feed', () => {
  test.beforeAll(() => {
    if (!hasRequiredEnvVars()) {
      test.skip();
    }
  });

  test.describe('Schema Dependencies', () => {
    test('audit_logs schema matches contract (no actor_type)', async () => {
      const supabase = createAnonClient();
      await assertTableContract(supabase, auditLogsContract);
    });

    test('audit_logs has required columns for feed', async () => {
      const supabase = createAnonClient();
      
      const { data, error } = await supabase.rpc('describe_table', {
        p_table_name: 'audit_logs'
      });
      
      if (error) throw error;

      const columns = data.map((c: { column_name: string }) => c.column_name);
      
      // These columns are used by action-center-feed
      const requiredForFeed = [
        'id',
        'event_type',
        'actor_id',
        'details',
        'created_at',
        'tenant_id'
      ];

      for (const col of requiredForFeed) {
        expect(columns).toContain(col);
      }
    });
  });

  test.describe('Function Endpoint', () => {
    test('function endpoint exists', async () => {
      const url = `${getSupabaseUrl()}/functions/v1/action-center-feed`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAnonKey()}`,
          'apikey': getAnonKey()
        },
        body: JSON.stringify({})
      });

      // Function should exist (any status except 404)
      expect(response.status).not.toBe(404);
    });

    test('function requires authentication', async () => {
      const url = `${getSupabaseUrl()}/functions/v1/action-center-feed`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
          // No auth headers
        },
        body: JSON.stringify({})
      });

      // Should require auth (401 or similar)
      expect([401, 403, 500]).toContain(response.status);
    });
  });
});
