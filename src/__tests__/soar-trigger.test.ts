import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * SOAR Trigger Logic Tests
 * Validates the alert → playbook mapping that drives automated response
 */

// Simulate the trigger's mapping logic (mirrors soar_evaluate_alert PL/pgSQL)
function mapAlertToTriggerType(alertType: string): string | null {
  const mapping: Record<string, string> = {
    vulnerability_critical: 'vulnerability_critical',
    antivirus_outdated: 'antivirus_outdated',
    certificate_expiring: 'certificate_expiring',
    usb_device_risky: 'usb_device_risky',
    process_suspicious: 'process_suspicious',
    behavioral_anomaly: 'behavioral_anomaly',
    agent_compromised: 'behavioral_anomaly',
    ai_insight_alert: 'behavioral_anomaly',
    firewall_disabled: 'antivirus_outdated',
    antivirus_inactive: 'antivirus_outdated',
    agent_long_offline: 'behavioral_anomaly',
  };
  return mapping[alertType] ?? null;
}

interface Playbook {
  id: string;
  triggerType: string;
  tenantId: string | null;
  isActive: boolean;
  cooldownMinutes: number;
  lastTriggeredAt: Date | null;
}

function findMatchingPlaybook(
  playbooks: Playbook[],
  triggerType: string,
  alertTenantId: string,
  now: Date = new Date()
): Playbook | null {
  const candidates = playbooks
    .filter(p => 
      p.triggerType === triggerType &&
      p.isActive &&
      (p.tenantId === alertTenantId || p.tenantId === null) &&
      (p.lastTriggeredAt === null || 
        now.getTime() - p.lastTriggeredAt.getTime() > p.cooldownMinutes * 60 * 1000)
    )
    .sort((a, b) => {
      if (a.tenantId === alertTenantId && b.tenantId !== alertTenantId) return -1;
      if (b.tenantId === alertTenantId && a.tenantId !== alertTenantId) return 1;
      return 0;
    });
  
  return candidates[0] ?? null;
}

describe('SOAR Alert-to-Trigger Mapping', () => {
  it('maps ai_insight_alert to behavioral_anomaly', () => {
    expect(mapAlertToTriggerType('ai_insight_alert')).toBe('behavioral_anomaly');
  });

  it('maps firewall_disabled to antivirus_outdated', () => {
    expect(mapAlertToTriggerType('firewall_disabled')).toBe('antivirus_outdated');
  });

  it('returns null for unknown alert types', () => {
    expect(mapAlertToTriggerType('unknown_type')).toBeNull();
    expect(mapAlertToTriggerType('stale_cron')).toBeNull();
  });

  it('maps all expected alert types', () => {
    const expectedMappings = [
      'vulnerability_critical', 'antivirus_outdated', 'certificate_expiring',
      'usb_device_risky', 'process_suspicious', 'behavioral_anomaly',
      'agent_compromised', 'ai_insight_alert', 'firewall_disabled',
      'antivirus_inactive', 'agent_long_offline',
    ];
    expectedMappings.forEach(type => {
      expect(mapAlertToTriggerType(type)).not.toBeNull();
    });
  });
});

describe('SOAR Playbook Matching', () => {
  const globalPlaybook: Playbook = {
    id: 'global-1',
    triggerType: 'behavioral_anomaly',
    tenantId: null,
    isActive: true,
    cooldownMinutes: 30,
    lastTriggeredAt: null,
  };

  const tenantPlaybook: Playbook = {
    id: 'tenant-1',
    triggerType: 'behavioral_anomaly',
    tenantId: 'tenant-A',
    isActive: true,
    cooldownMinutes: 30,
    lastTriggeredAt: null,
  };

  it('matches global playbook when no tenant-specific exists', () => {
    const result = findMatchingPlaybook([globalPlaybook], 'behavioral_anomaly', 'tenant-B');
    expect(result?.id).toBe('global-1');
  });

  it('prefers tenant-specific playbook over global', () => {
    const result = findMatchingPlaybook(
      [globalPlaybook, tenantPlaybook],
      'behavioral_anomaly',
      'tenant-A'
    );
    expect(result?.id).toBe('tenant-1');
  });

  it('falls back to global when tenant playbook is on cooldown', () => {
    const recentlyTriggered: Playbook = {
      ...tenantPlaybook,
      lastTriggeredAt: new Date(), // just triggered
    };
    const result = findMatchingPlaybook(
      [globalPlaybook, recentlyTriggered],
      'behavioral_anomaly',
      'tenant-A'
    );
    expect(result?.id).toBe('global-1');
  });

  it('returns null when all playbooks are on cooldown', () => {
    const both = [
      { ...globalPlaybook, lastTriggeredAt: new Date() },
      { ...tenantPlaybook, lastTriggeredAt: new Date() },
    ];
    const result = findMatchingPlaybook(both, 'behavioral_anomaly', 'tenant-A');
    expect(result).toBeNull();
  });

  it('skips inactive playbooks', () => {
    const inactive: Playbook = { ...globalPlaybook, isActive: false };
    const result = findMatchingPlaybook([inactive], 'behavioral_anomaly', 'tenant-A');
    expect(result).toBeNull();
  });

  it('does not match wrong trigger type', () => {
    const result = findMatchingPlaybook([globalPlaybook], 'vulnerability_critical', 'tenant-A');
    expect(result).toBeNull();
  });
});
