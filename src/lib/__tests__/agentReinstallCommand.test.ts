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
    expect(cmd).toBeTruthy();
    expect(typeof cmd).toBe('string');
  });

  it('includes server URL', () => {
    const cmd = buildAgentReinstallCommand(params);
    expect(cmd).toContain('https://example.com');
  });

  it('includes agent name', () => {
    const cmd = buildAgentReinstallCommand(params);
    expect(cmd).toContain('PC-001');
  });

  it('uses secure file storage for tokens', () => {
    const cmd = buildAgentReinstallCommand(params);
    expect(cmd).toContain('secrets');
    expect(cmd).toContain('agent.token');
    expect(cmd).toContain('hmac.secret');
  });

  it('does NOT include tokens in task arguments', () => {
    const cmd = buildAgentReinstallCommand(params);
    // The task action arguments should only contain -ServerUrl and -AgentName, not tokens
    const taskArgMatch = cmd.match(/\$taskArgStr\s*=\s*'([^']*)'/);
    if (taskArgMatch) {
      expect(taskArgMatch[1]).not.toContain('AgentToken');
      expect(taskArgMatch[1]).not.toContain('HMACSecret');
    }
  });

  it('handles fallback URL', () => {
    const cmd = buildAgentReinstallCommand({ ...params, fallbackServerUrl: 'https://backup.com' });
    expect(cmd).toContain('backup.com');
  });

  it('escapes single quotes in values', () => {
    const cmd = buildAgentReinstallCommand({ ...params, agentName: "PC's Test" });
    expect(cmd).toContain("PC''s Test");
  });

  it('creates scheduled task', () => {
    const cmd = buildAgentReinstallCommand(params);
    expect(cmd).toContain('Register-ScheduledTask');
    expect(cmd).toContain('CyberShieldAgent');
  });
});
