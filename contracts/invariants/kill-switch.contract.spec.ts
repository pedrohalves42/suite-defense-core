import { test, expect } from '@playwright/test';
import { createAnonClient, hasRequiredEnvVars } from '../utils/supabase';
import { isEmergencyMode, getSystemMode } from '../utils/emergency';

/**
 * Kill Switch Contract Tests
 * 
 * These tests validate that the emergency/kill switch infrastructure exists
 * and is functional. The actual E2E cascade tests are in e2e/kill-switch-cascade.spec.ts
 */

test.describe('Security Invariant: Kill Switch Infrastructure', () => {
  test.beforeAll(() => {
    if (!hasRequiredEnvVars()) {
      test.skip();
    }
  });

  test('is_emergency_mode RPC returns valid boolean', async () => {
    const supabase = createAnonClient();
    
    const result = await isEmergencyMode(supabase);
    expect(typeof result).toBe('boolean');
  });

  test('get_system_mode_safe RPC returns valid mode', async () => {
    const supabase = createAnonClient();
    
    const mode = await getSystemMode(supabase);
    expect(typeof mode).toBe('string');
    
    // Valid modes
    const validModes = ['normal', 'restricted', 'emergency_stop', 'unknown'];
    expect(validModes).toContain(mode);
  });

  test('system_global_state table exists and has mode column', async () => {
    const supabase = createAnonClient();
    
    const { data, error } = await supabase.rpc('describe_table', {
      p_table_name: 'system_global_state'
    });
    
    if (error) {
      throw new Error(`system_global_state table check failed: ${error.message}`);
    }

    const columns = data.map((c: { column_name: string }) => c.column_name);
    expect(columns).toContain('mode');
  });

  test('scheduled_job_heartbeat table exists for cron monitoring', async () => {
    const supabase = createAnonClient();
    
    const { data, error } = await supabase.rpc('describe_table', {
      p_table_name: 'scheduled_job_heartbeat'
    });
    
    if (error) {
      if (error.message.includes('does not exist')) {
        throw new Error('CRITICAL: scheduled_job_heartbeat table does not exist');
      }
      throw error;
    }

    const columns = data.map((c: { column_name: string }) => c.column_name);
    expect(columns).toContain('job_key');
    expect(columns).toContain('last_seen_at');
    expect(columns).toContain('expected_interval');
  });

  test('v_cron_silence view exists for silence detection', async () => {
    const supabase = createAnonClient();
    
    // Try to query the view
    const { error } = await supabase
      .from('v_cron_silence')
      .select('*')
      .limit(1);

    // View should exist (may return empty or permission error, but not "does not exist")
    if (error) {
      expect(error.message).not.toContain('does not exist');
    }
  });
});
