import { describe, it, expect } from 'vitest';
import { LightModeConfig } from '../entities/LightModeConfig';
import { AgentId } from '../value-objects/AgentId';

describe('LightModeConfig', () => {
  const agentId = AgentId.generate();

  it('creates with defaults', () => {
    const result = LightModeConfig.create(agentId);
    expect(result.isSuccess).toBe(true);
    expect(result.value.isActive).toBe(false);
    expect(result.value.thresholds.cpuThresholdPercent).toBe(50);
  });

  it('rejects invalid CPU threshold', () => {
    const result = LightModeConfig.create(agentId, { cpuThresholdPercent: 150 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects negative network threshold', () => {
    const result = LightModeConfig.create(agentId, { networkThresholdMbps: -1 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects zero duration', () => {
    const result = LightModeConfig.create(agentId, { durationMinutes: 0 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects interval < 60s', () => {
    const result = LightModeConfig.create(agentId, { reducedIntervalSeconds: 30 });
    expect(result.isFailure).toBe(true);
  });

  describe('shouldActivate', () => {
    it('activates when thresholds met and media detected', () => {
      const config = LightModeConfig.create(agentId).value;
      const should = config.shouldActivate(['chrome.exe', 'notepad'], 60, 15);
      expect(should).toBe(true);
    });

    it('does not activate without media processes', () => {
      const config = LightModeConfig.create(agentId).value;
      expect(config.shouldActivate(['notepad'], 60, 15)).toBe(false);
    });

    it('does not activate with low CPU', () => {
      const config = LightModeConfig.create(agentId).value;
      expect(config.shouldActivate(['chrome'], 10, 15)).toBe(false);
    });

    it('does not activate if already active', () => {
      const config = LightModeConfig.create(agentId).value;
      config.activate('test', ['chrome']);
      expect(config.shouldActivate(['chrome'], 60, 15)).toBe(false);
    });
  });

  describe('activate/deactivate', () => {
    it('activates and sets reduced settings', () => {
      const config = LightModeConfig.create(agentId).value;
      config.activate('streaming', ['chrome']);
      expect(config.isActive).toBe(true);
      expect(config.skipProcessCollection).toBe(true);
      expect(config.compressPayloads).toBe(true);
      expect(config.collectionIntervalSeconds).toBe(600);
    });

    it('deactivate restores defaults', () => {
      const config = LightModeConfig.create(agentId).value;
      config.activate('test', []);
      config.deactivate();
      expect(config.isActive).toBe(false);
      expect(config.skipProcessCollection).toBe(false);
      expect(config.collectionIntervalSeconds).toBe(60);
    });

    it('double activate is no-op', () => {
      const config = LightModeConfig.create(agentId).value;
      config.activate('reason1', ['a']);
      const expiry = config.expiresAt;
      config.activate('reason2', ['b']);
      expect(config.expiresAt).toBe(expiry); // unchanged
    });
  });

  describe('checkExpiration', () => {
    it('does not expire when not active', () => {
      const config = LightModeConfig.create(agentId).value;
      expect(config.checkExpiration()).toBe(false);
    });
  });
});
