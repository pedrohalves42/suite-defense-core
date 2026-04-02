import { describe, it, expect } from 'vitest';
import { DEFAULT_PLAYBOOKS } from '@/domain/services/DefaultPlaybooks';
import { TriggerType, PlaybookSeverity, type SoarTrigger } from '@/domain/services/SoarEngine';

describe('DefaultPlaybooks', () => {
  it('has 7 playbooks', () => {
    expect(DEFAULT_PLAYBOOKS).toHaveLength(7);
  });

  it('all have unique IDs', () => {
    const ids = DEFAULT_PLAYBOOKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all are active', () => {
    expect(DEFAULT_PLAYBOOKS.every(p => p.isActive)).toBe(true);
  });

  it('each has at least one rule', () => {
    expect(DEFAULT_PLAYBOOKS.every(p => p.rules.length > 0)).toBe(true);
  });

  it('critical vuln playbook matches CVSS >= 9.0', () => {
    const pb = DEFAULT_PLAYBOOKS.find(p => p.id === 'pb-vuln-critical')!;
    const trigger: SoarTrigger = {
      type: TriggerType.VULNERABILITY_CRITICAL,
      agentId: 'a1',
      tenantId: 't1',
      severity: PlaybookSeverity.CRITICAL,
      data: { cvssScore: 9.5 },
    };
    expect(pb.rules[0].condition(trigger)).toBe(true);
  });

  it('critical vuln playbook rejects CVSS < 9.0', () => {
    const pb = DEFAULT_PLAYBOOKS.find(p => p.id === 'pb-vuln-critical')!;
    const trigger: SoarTrigger = {
      type: TriggerType.VULNERABILITY_CRITICAL,
      agentId: 'a1',
      tenantId: 't1',
      severity: PlaybookSeverity.HIGH,
      data: { cvssScore: 7.5 },
    };
    expect(pb.rules[0].condition(trigger)).toBe(false);
  });

  it('USB playbook matches storage device with high risk score', () => {
    const pb = DEFAULT_PLAYBOOKS.find(p => p.id === 'pb-usb-block')!;
    const trigger: SoarTrigger = {
      type: TriggerType.USB_DEVICE_RISKY,
      agentId: 'a1',
      tenantId: 't1',
      severity: PlaybookSeverity.HIGH,
      data: { deviceType: 'storage', riskScore: 80 },
    };
    expect(pb.rules[0].condition(trigger)).toBe(true);
  });

  it('cert expiry playbook matches <=7 days', () => {
    const pb = DEFAULT_PLAYBOOKS.find(p => p.id === 'pb-cert-expiry')!;
    const trigger: SoarTrigger = {
      type: TriggerType.CERTIFICATE_EXPIRING,
      agentId: 'a1',
      tenantId: 't1',
      severity: PlaybookSeverity.HIGH,
      data: { daysUntilExpiry: 5 },
    };
    expect(pb.rules[0].condition(trigger)).toBe(true);
    expect(pb.rules[1].condition(trigger)).toBe(false); // 30-day rule excludes <=7
  });

  it('network anomaly playbook matches high error rate', () => {
    const pb = DEFAULT_PLAYBOOKS.find(p => p.id === 'pb-network-anomaly')!;
    const trigger: SoarTrigger = {
      type: TriggerType.NETWORK_ANOMALY,
      agentId: 'a1',
      tenantId: 't1',
      severity: PlaybookSeverity.HIGH,
      data: { errorRate: 0.15 },
    };
    expect(pb.rules[0].condition(trigger)).toBe(true);
  });
});
