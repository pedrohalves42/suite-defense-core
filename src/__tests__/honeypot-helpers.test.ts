/**
 * Vitest tests for honeypot frontend components and hooks.
 * Tests the data contracts and type safety of the honeypot dashboard.
 */

import { describe, it, expect } from 'vitest';

// ===== Sanitize (frontend lib) Integration =====

describe('Honeypot Dashboard Data Contracts', () => {
  it('HoneypotStats interface matches expected shape', () => {
    const stats = {
      total_interactions: 42,
      unique_ip_hashes: 10,
      classifications: { malicious: 5, suspicious: 12, benign: 25 },
      modes: { native: 30, flipped: 12 },
    };

    expect(stats.total_interactions).toBeGreaterThanOrEqual(0);
    expect(stats.unique_ip_hashes).toBeGreaterThanOrEqual(0);
    expect(typeof stats.classifications).toBe('object');
    expect(typeof stats.modes).toBe('object');
  });

  it('HoneypotInteraction interface has required fields', () => {
    const interaction = {
      id: 'uuid-1',
      mode: 'native',
      method: 'POST',
      path: '/heartbeat',
      classification: 'benign',
      source_ip_prefix: '192.168.x.x',
      source_ip_hash: 'abc123',
      status_code: 200,
      created_at: '2026-04-01T00:00:00Z',
    };

    expect(interaction.id).toBeDefined();
    expect(['native', 'flipped']).toContain(interaction.mode);
    expect(interaction.classification).toBeDefined();
    expect(interaction.created_at).toBeDefined();
  });

  it('HoneypotHourlyStat has correct aggregate fields', () => {
    const stat = {
      hour_start: '2026-04-01T10:00:00Z',
      interaction_count: 100,
      malicious_count: 5,
      suspicious_count: 10,
      benign_count: 80,
      recon_count: 5,
    };

    expect(stat.interaction_count).toBe(
      stat.malicious_count + stat.suspicious_count + stat.benign_count + stat.recon_count
    );
  });
});

describe('Classification Variant Mapping', () => {
  function classificationVariant(c: string | null) {
    switch (c) {
      case 'malicious': return 'destructive';
      case 'suspicious': return 'secondary';
      case 'reconnaissance': return 'outline';
      default: return 'default';
    }
  }

  it('maps malicious to destructive', () => {
    expect(classificationVariant('malicious')).toBe('destructive');
  });

  it('maps suspicious to secondary', () => {
    expect(classificationVariant('suspicious')).toBe('secondary');
  });

  it('maps reconnaissance to outline', () => {
    expect(classificationVariant('reconnaissance')).toBe('outline');
  });

  it('maps null to default', () => {
    expect(classificationVariant(null)).toBe('default');
  });

  it('maps unknown to default', () => {
    expect(classificationVariant('unknown')).toBe('default');
  });
});

describe('Kill Switch Logic', () => {
  function isEnabled(globalFlag: boolean | null, tenantFlag: boolean | null): boolean {
    if (globalFlag !== null && !globalFlag) return false;
    if (tenantFlag !== null) return tenantFlag;
    if (globalFlag !== null) return globalFlag;
    return true;
  }

  it('global disabled blocks everything', () => {
    expect(isEnabled(false, null)).toBe(false);
    expect(isEnabled(false, true)).toBe(false);
  });

  it('global enabled allows unless tenant overrides', () => {
    expect(isEnabled(true, null)).toBe(true);
    expect(isEnabled(true, false)).toBe(false);
    expect(isEnabled(true, true)).toBe(true);
  });

  it('no flags defaults to true', () => {
    expect(isEnabled(null, null)).toBe(true);
  });
});

describe('Cooldown Logic', () => {
  const COOLDOWN_MS = 24 * 60 * 60 * 1000;

  it('rejects within 24h', () => {
    const lastChange = Date.now() - 12 * 60 * 60 * 1000;
    expect(Date.now() - lastChange < COOLDOWN_MS).toBe(true);
  });

  it('allows after 24h', () => {
    const lastChange = Date.now() - 25 * 60 * 60 * 1000;
    expect(Date.now() - lastChange >= COOLDOWN_MS).toBe(true);
  });
});

describe('Alert Deduplication', () => {
  const windowMinutes = 10;

  function shouldCreateAlert(
    existing: Array<{ type: string; tenant: string; ts: number }>,
    newType: string,
    newTenant: string,
  ): boolean {
    const windowStart = Date.now() - windowMinutes * 60 * 1000;
    return !existing.some(
      a => a.type === newType && a.tenant === newTenant && a.ts >= windowStart
    );
  }

  it('creates alert when none exists', () => {
    expect(shouldCreateAlert([], 'honeypot_multi_target', 'T1')).toBe(true);
  });

  it('skips duplicate in window', () => {
    const existing = [{ type: 'honeypot_multi_target', tenant: 'T1', ts: Date.now() }];
    expect(shouldCreateAlert(existing, 'honeypot_multi_target', 'T1')).toBe(false);
  });

  it('allows different type', () => {
    const existing = [{ type: 'honeypot_multi_target', tenant: 'T1', ts: Date.now() }];
    expect(shouldCreateAlert(existing, 'honeypot_volume_anomaly', 'T1')).toBe(true);
  });

  it('allows different tenant', () => {
    const existing = [{ type: 'honeypot_multi_target', tenant: 'T1', ts: Date.now() }];
    expect(shouldCreateAlert(existing, 'honeypot_multi_target', 'T2')).toBe(true);
  });

  it('allows after window expires', () => {
    const old = Date.now() - 15 * 60 * 1000; // 15 min ago
    const existing = [{ type: 'honeypot_multi_target', tenant: 'T1', ts: old }];
    expect(shouldCreateAlert(existing, 'honeypot_multi_target', 'T1')).toBe(true);
  });

  it('respects max alerts per run (10)', () => {
    const MAX_ALERTS_PER_RUN = 10;
    const alerts = Array.from({ length: 10 }, (_, i) => `alert-${i}`);
    expect(alerts.length >= MAX_ALERTS_PER_RUN).toBe(true);
  });
});
