import { describe, it, expect } from 'vitest';
import { buildAgentReinstallCommand } from '../agentReinstallCommand';

describe('agentReinstallCommand', () => {
  const params = {
    serverUrl: 'https://example.com',
    agentToken: 'token123',
    hmacSecret: 'secret456',
    agentName: 'PC-001',
  };

  it('generates command string', () => {
    const cmd = buildAgentReinstallCommand(params);
    expect(typeof cmd).toBe('string');
    expect(cmd.length).toBeGreaterThan(0);
    // New loader architecture check (v6.2)
    expect(cmd).toContain('iwr -useb');
    expect(cmd).toContain('public:get-reinstall-script');
    expect(cmd).toContain('scriptblock');
  });

  it('includes server URL', () => {
    const cmd = buildAgentReinstallCommand(params);
    expect(cmd).toContain('https://example.com');
  });

  it('includes agent name', () => {
    const cmd = buildAgentReinstallCommand(params);
    expect(cmd).toContain('PC-001');
  });

  it('uses secure parameters passing', () => {
    const cmd = buildAgentReinstallCommand(params);
    // Should pass tokens as variables to the loader
    expect(cmd).toContain('$t=\'token123\'');
    expect(cmd).toContain('$s=\'secret456\'');
  });

  it('escapes single quotes in values', () => {
    const cmd = buildAgentReinstallCommand({
      ...params,
      agentName: "O'Conner",
    });
    expect(cmd).toContain("'O''Conner'");
  });

  it('handles fallback URL', () => {
    const cmd = buildAgentReinstallCommand({
      ...params,
      fallbackServerUrl: 'https://other.supabase.co',
    });
    expect(cmd).toContain("'https://other.supabase.co'");
  });
});
