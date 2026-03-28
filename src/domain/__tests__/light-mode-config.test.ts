import { describe, it, expect, beforeEach } from 'vitest';
import { LightModeConfig, DEFAULT_MEDIA_PROCESSES } from '../entities/LightModeConfig';
import { AgentId } from '../value-objects/AgentId';

describe('LightModeConfig', () => {
  let agentId: AgentId;

  beforeEach(() => {
    agentId = AgentId.generate();
  });

  // ── Creation ──

  it('creates with default thresholds', () => {
    const result = LightModeConfig.create(agentId);
    expect(result.isSuccess).toBe(true);
    const config = result.value;
    expect(config.isActive).toBe(false);
    expect(config.collectionIntervalSeconds).toBe(60);
    expect(config.skipProcessCollection).toBe(false);
    expect(config.skipNetworkCollection).toBe(false);
    expect(config.compressPayloads).toBe(false);
    expect(config.thresholds.cpuThresholdPercent).toBe(50);
    expect(config.thresholds.networkThresholdMbps).toBe(10);
    expect(config.thresholds.durationMinutes).toBe(15);
  });

  it('creates with custom thresholds', () => {
    const result = LightModeConfig.create(agentId, {
      cpuThresholdPercent: 70,
      networkThresholdMbps: 20,
      durationMinutes: 30,
    });
    expect(result.isSuccess).toBe(true);
    expect(result.value.thresholds.cpuThresholdPercent).toBe(70);
    expect(result.value.thresholds.networkThresholdMbps).toBe(20);
    expect(result.value.thresholds.durationMinutes).toBe(30);
  });

  it('rejects null agentId', () => {
    const result = LightModeConfig.create(null as any);
    expect(result.isFailure).toBe(true);
  });

  it('rejects invalid CPU threshold', () => {
    const result = LightModeConfig.create(agentId, { cpuThresholdPercent: 150 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects negative network threshold', () => {
    const result = LightModeConfig.create(agentId, { networkThresholdMbps: -5 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects zero duration', () => {
    const result = LightModeConfig.create(agentId, { durationMinutes: 0 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects interval below 60s', () => {
    const result = LightModeConfig.create(agentId, { reducedIntervalSeconds: 30 });
    expect(result.isFailure).toBe(true);
  });

  // ── shouldActivate ──

  it('activates when media processes detected with high CPU and network', () => {
    const config = LightModeConfig.create(agentId).value;
    const result = config.shouldActivate(['chrome.exe', 'notepad.exe'], 75, 15);
    expect(result).toBe(true);
  });

  it('does not activate without media processes', () => {
    const config = LightModeConfig.create(agentId).value;
    const result = config.shouldActivate(['notepad.exe', 'calc.exe'], 80, 20);
    expect(result).toBe(false);
  });

  it('does not activate with low CPU', () => {
    const config = LightModeConfig.create(agentId).value;
    const result = config.shouldActivate(['chrome.exe'], 30, 20);
    expect(result).toBe(false);
  });

  it('does not activate with low network', () => {
    const config = LightModeConfig.create(agentId).value;
    const result = config.shouldActivate(['chrome.exe'], 80, 5);
    expect(result).toBe(false);
  });

  it('does not activate if already active', () => {
    const config = LightModeConfig.create(agentId).value;
    config.activate('test', ['chrome']);
    const result = config.shouldActivate(['chrome.exe'], 80, 20);
    expect(result).toBe(false);
  });

  it('matches process names case-insensitively without .exe', () => {
    const config = LightModeConfig.create(agentId).value;
    expect(config.shouldActivate(['CHROME.EXE'], 80, 20)).toBe(true);
    expect(config.shouldActivate(['Chrome'], 80, 20)).toBe(true);
    expect(config.shouldActivate(['teams.exe'], 80, 20)).toBe(true);
  });

  // ── Activation / Deactivation ──

  it('activates with correct settings', () => {
    const config = LightModeConfig.create(agentId).value;
    config.activate('media_streaming_detected', ['chrome', 'vlc']);

    expect(config.isActive).toBe(true);
    expect(config.activatedAt).not.toBeNull();
    expect(config.expiresAt).not.toBeNull();
    expect(config.reason).toBe('media_streaming_detected');
    expect(config.activeMediaProcesses).toEqual(['chrome', 'vlc']);
    expect(config.collectionIntervalSeconds).toBe(600);
    expect(config.skipProcessCollection).toBe(true);
    expect(config.skipNetworkCollection).toBe(true);
    expect(config.compressPayloads).toBe(true);
  });

  it('does not double-activate', () => {
    const config = LightModeConfig.create(agentId).value;
    config.activate('test', ['chrome']);
    const firstExpires = config.expiresAt;
    config.activate('test2', ['vlc']);
    expect(config.expiresAt).toBe(firstExpires);
    expect(config.reason).toBe('test');
  });

  it('deactivates and restores defaults', () => {
    const config = LightModeConfig.create(agentId).value;
    config.activate('test', ['chrome']);
    config.deactivate();

    expect(config.isActive).toBe(false);
    expect(config.activatedAt).toBeNull();
    expect(config.expiresAt).toBeNull();
    expect(config.reason).toBe('');
    expect(config.activeMediaProcesses).toEqual([]);
    expect(config.collectionIntervalSeconds).toBe(60);
    expect(config.skipProcessCollection).toBe(false);
    expect(config.skipNetworkCollection).toBe(false);
    expect(config.compressPayloads).toBe(false);
  });

  // ── Expiration ──

  it('detects expiration and deactivates', () => {
    const config = LightModeConfig.create(agentId, { durationMinutes: 1 }).value;
    config.activate('test', ['chrome']);

    // Manually set expires_at to the past
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).props.expiresAt = new Date(Date.now() - 1000);

    const expired = config.checkExpiration();
    expect(expired).toBe(true);
    expect(config.isActive).toBe(false);
  });

  it('does not expire when still within duration', () => {
    const config = LightModeConfig.create(agentId).value;
    config.activate('test', ['chrome']);

    const expired = config.checkExpiration();
    expect(expired).toBe(false);
    expect(config.isActive).toBe(true);
  });

  it('checkExpiration returns false when not active', () => {
    const config = LightModeConfig.create(agentId).value;
    expect(config.checkExpiration()).toBe(false);
  });

  // ── Remaining Minutes ──

  it('returns remaining minutes when active', () => {
    const config = LightModeConfig.create(agentId).value;
    config.activate('test', ['chrome']);
    expect(config.remainingMinutes).toBeGreaterThan(0);
    expect(config.remainingMinutes).toBeLessThanOrEqual(15);
  });

  it('returns 0 remaining minutes when not active', () => {
    const config = LightModeConfig.create(agentId).value;
    expect(config.remainingMinutes).toBe(0);
  });

  // ── Default Media Processes ──

  it('has comprehensive default media processes list', () => {
    expect(DEFAULT_MEDIA_PROCESSES).toContain('chrome');
    expect(DEFAULT_MEDIA_PROCESSES).toContain('firefox');
    expect(DEFAULT_MEDIA_PROCESSES).toContain('vlc');
    expect(DEFAULT_MEDIA_PROCESSES).toContain('obs64');
    expect(DEFAULT_MEDIA_PROCESSES).toContain('teams');
    expect(DEFAULT_MEDIA_PROCESSES).toContain('zoom');
    expect(DEFAULT_MEDIA_PROCESSES).toContain('discord');
  });
});
