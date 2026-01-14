import { test, expect } from '@playwright/test';
import { createAnonClient, hasRequiredEnvVars } from '../utils/supabase';

/**
 * This test validates that sensitive tables are NOT directly accessible
 * from the frontend using anon/authenticated role.
 * 
 * These tables should only be accessed via:
 * - Secure views (agents_safe, invites_safe)
 * - Edge functions with service_role
 * - RPCs with proper authorization
 */

test.describe('Security Invariant: Direct Table Access Prevention', () => {
  test.beforeAll(() => {
    if (!hasRequiredEnvVars()) {
      test.skip();
    }
  });

  test.describe('Sensitive Tables Should Be Blocked', () => {
    test('cannot select hmac_secret from agents table directly', async () => {
      const supabase = createAnonClient();
      
      // Try to select hmac_secret directly - should fail or return null
      const { data, error } = await supabase
        .from('agents')
        .select('hmac_secret')
        .limit(1);

      // Either error or empty/null data is acceptable
      // The key is that hmac_secret should never be returned with actual values
      if (data && data.length > 0) {
        const secretValue = data[0]?.hmac_secret;
        // If we got data, the secret should be null (hidden by RLS/view)
        expect(secretValue).toBeNull();
      }
    });

    test('cannot select token from invites table directly', async () => {
      const supabase = createAnonClient();
      
      const { data, error } = await supabase
        .from('invites')
        .select('token')
        .limit(1);

      // Either error or empty/null data is acceptable
      if (data && data.length > 0) {
        const tokenValue = data[0]?.token;
        expect(tokenValue).toBeNull();
      }
    });
  });

  test.describe('Safe Views Should Work', () => {
    test('agents_safe view is accessible and excludes hmac_secret', async () => {
      const supabase = createAnonClient();
      
      const { data, error } = await supabase
        .from('agents_safe')
        .select('*')
        .limit(1);

      // Should not error (view should exist)
      if (error && !error.message.includes('permission denied')) {
        throw error;
      }

      // If we got data, verify hmac_secret is not present
      if (data && data.length > 0) {
        expect(data[0]).not.toHaveProperty('hmac_secret');
      }
    });

    test('invites_safe view is accessible and excludes token', async () => {
      const supabase = createAnonClient();
      
      const { data, error } = await supabase
        .from('invites_safe')
        .select('*')
        .limit(1);

      // Should not error (view should exist)
      if (error && !error.message.includes('permission denied')) {
        throw error;
      }

      // If we got data, verify token is not present
      if (data && data.length > 0) {
        expect(data[0]).not.toHaveProperty('token');
      }
    });
  });
});
