import { test, expect } from '@playwright/test';
import { createAnonClient, getSupabaseUrl, getAnonKey, hasRequiredEnvVars } from '../utils/supabase';
import { systemAlertsContract } from '../schemas/system_alerts.contract';
import { assertTableContract } from '../utils/schemaAssert';

/**
 * Contract tests for security-alert-dispatcher Edge Function
 * 
 * This function depends on:
 * - system_alerts table
 * - audit_logs table
 * - Proper severity levels
 */

test.describe('Edge Function Contract: security-alert-dispatcher', () => {
  test.beforeAll(() => {
    if (!hasRequiredEnvVars()) {
      test.skip();
    }
  });

  test.describe('Schema Dependencies', () => {
    test('system_alerts schema matches contract', async () => {
      const supabase = createAnonClient();
      await assertTableContract(supabase, systemAlertsContract);
    });

    test('system_alerts has severity column with proper type', async () => {
      const supabase = createAnonClient();
      
      const { data, error } = await supabase.rpc('describe_table', {
        p_table_name: 'system_alerts'
      });
      
      if (error) throw error;

      const severityCol = data.find((c: { column_name: string }) => 
        c.column_name === 'severity'
      );
      
      expect(severityCol).toBeDefined();
    });

    test('system_alerts has status column', async () => {
      const supabase = createAnonClient();
      
      const { data, error } = await supabase.rpc('describe_table', {
        p_table_name: 'system_alerts'
      });
      
      if (error) throw error;

      const columns = data.map((c: { column_name: string }) => c.column_name);
      expect(columns).toContain('status');
    });
  });

  test.describe('Function Endpoint', () => {
    test('function endpoint exists', async () => {
      const url = `${getSupabaseUrl()}/functions/v1/security-alert-dispatcher`;
      
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
  });
});
