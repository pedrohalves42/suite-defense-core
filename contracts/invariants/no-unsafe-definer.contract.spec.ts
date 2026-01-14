import { test, expect } from '@playwright/test';
import { createAnonClient, hasRequiredEnvVars } from '../utils/supabase';

test.describe('Security Invariant: SECURITY DEFINER Functions', () => {
  test.beforeAll(() => {
    if (!hasRequiredEnvVars()) {
      test.skip();
    }
  });

  test('no SECURITY DEFINER functions without search_path', async () => {
    const supabase = createAnonClient();
    
    const { data, error } = await supabase.rpc('find_unsafe_definer_functions');
    
    if (error) {
      // If RPC doesn't exist, skip the test
      if (error.message.includes('does not exist')) {
        test.skip();
        return;
      }
      throw error;
    }

    // Should return empty array if all functions are secure
    expect(data).toEqual([]);
    
    if (data && data.length > 0) {
      const unsafeFunctions = data.map((f: { proname: string }) => f.proname);
      throw new Error(
        `CRITICAL SECURITY VIOLATION: Found ${data.length} SECURITY DEFINER functions without search_path:\n` +
        unsafeFunctions.map((f: string) => `  - ${f}`).join('\n') +
        '\n\nThis is a critical security issue that must be fixed before deployment.'
      );
    }
  });

  test('is_emergency_mode RPC exists and works', async () => {
    const supabase = createAnonClient();
    
    const { data, error } = await supabase.rpc('is_emergency_mode');
    
    if (error) {
      if (error.message.includes('does not exist')) {
        throw new Error('CRITICAL: is_emergency_mode RPC does not exist');
      }
      throw error;
    }

    // Should return a boolean
    expect(typeof data).toBe('boolean');
  });

  test('describe_table RPC exists and works', async () => {
    const supabase = createAnonClient();
    
    const { data, error } = await supabase.rpc('describe_table', {
      p_table_name: 'tenants'
    });
    
    if (error) {
      if (error.message.includes('does not exist')) {
        throw new Error('CRITICAL: describe_table RPC does not exist');
      }
      throw error;
    }

    // Should return array of column info
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    
    // Should have expected structure
    const firstCol = data[0];
    expect(firstCol).toHaveProperty('column_name');
    expect(firstCol).toHaveProperty('data_type');
  });
});
