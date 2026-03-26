import { describe, it, expect, beforeEach } from 'vitest';
import { setEnv, resetEnv } from './edge-mocks';

// Import the functions under test — they reference Deno.env which is now mocked
import { requireEnv, optionalEnv, getSupabaseConfig, getSupabaseFullConfig } from '../../supabase/functions/_shared/env';

describe('env utilities', () => {
  beforeEach(() => {
    resetEnv();
  });

  describe('requireEnv', () => {
    it('returns the value when set', () => {
      setEnv('MY_VAR', 'hello');
      expect(requireEnv('MY_VAR')).toBe('hello');
    });

    it('throws when the variable is missing', () => {
      expect(() => requireEnv('MISSING')).toThrow('Server configuration error: missing MISSING');
    });

    it('throws when the variable is empty', () => {
      setEnv('EMPTY', '');
      expect(() => requireEnv('EMPTY')).toThrow('Server configuration error: missing EMPTY');
    });
  });

  describe('optionalEnv', () => {
    it('returns the value when set', () => {
      setEnv('OPT', 'value');
      expect(optionalEnv('OPT', 'default')).toBe('value');
    });

    it('returns the default when missing', () => {
      expect(optionalEnv('NOPE', 'fallback')).toBe('fallback');
    });
  });

  describe('getSupabaseConfig', () => {
    it('returns url and serviceRoleKey when set', () => {
      setEnv('SUPABASE_URL', 'https://x.supabase.co');
      setEnv('SUPABASE_SERVICE_ROLE_KEY', 'sk');
      const cfg = getSupabaseConfig();
      expect(cfg.url).toBe('https://x.supabase.co');
      expect(cfg.serviceRoleKey).toBe('sk');
    });

    it('throws when SUPABASE_URL is missing', () => {
      setEnv('SUPABASE_SERVICE_ROLE_KEY', 'sk');
      expect(() => getSupabaseConfig()).toThrow(/missing SUPABASE_URL/);
    });
  });

  describe('getSupabaseFullConfig', () => {
    it('includes anonKey', () => {
      setEnv('SUPABASE_URL', 'u');
      setEnv('SUPABASE_SERVICE_ROLE_KEY', 's');
      setEnv('SUPABASE_ANON_KEY', 'a');
      expect(getSupabaseFullConfig().anonKey).toBe('a');
    });
  });
});
