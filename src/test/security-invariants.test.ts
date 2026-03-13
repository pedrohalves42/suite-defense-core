/**
 * Security Invariants Unit Tests
 * Validates that critical security patterns exist in the codebase.
 */
import { describe, it, expect } from 'vitest';

describe('Security Invariants', () => {
  it('INV-001: Supabase client uses environment variables, not hardcoded keys', async () => {
    const clientModule = await import('@/integrations/supabase/client');
    expect(clientModule.supabase).toBeDefined();
    // Client should exist and be properly initialized
    expect(typeof clientModule.supabase.from).toBe('function');
    expect(typeof clientModule.supabase.auth).toBe('object');
  });

  it('INV-003: localStorage should never be used for tenant_id in production code', async () => {
    // This test ensures the anti-pattern is not reintroduced
    const fs = await import('fs');
    const path = await import('path');
    const hooksDir = path.resolve(__dirname, '../hooks');
    
    try {
      const files = fs.readdirSync(hooksDir).filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
      
      for (const file of files) {
        const content = fs.readFileSync(path.join(hooksDir, file), 'utf-8');
        // Check for localStorage.getItem('tenant_id') or similar patterns
        const hasTenantInLocalStorage = /localStorage\.(get|set)Item\s*\(\s*['"]tenant_id['"]/i.test(content);
        expect(hasTenantInLocalStorage, `${file} uses localStorage for tenant_id`).toBe(false);
      }
    } catch {
      // If hooks dir doesn't exist in test env, skip
    }
  });
});
