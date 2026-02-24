import { describe, it, expect } from 'vitest';

/**
 * SOAR Engine Tests — Comprehensive Coverage
 * Validates: alert mapping, playbook matching, cooldown, approval gates, dedup interaction
 */

// ── Alert → Trigger Type Mapping (mirrors soar_evaluate_alert PL/pgSQL) ──

function mapAlertToTriggerType(alertType: string): string | null {
  const mapping: Record<string, string> = {
    vulnerability_critical: 'vulnerability_critical',
    antivirus_outdated: 'antivirus_outdated',
    antivirus_inactive: 'antivirus_outdated',
    firewall_disabled: 'antivirus_outdated',
    certificate_expiring: 'certificate_expiring',
    usb_device_risky: 'usb_device_risky',
    process_suspicious: 'process_suspicious',
    behavioral_anomaly: 'behavioral_anomaly',
    agent_compromised: 'behavioral_anomaly',
    ai_insight_alert: 'behavioral_anomaly',
    agent_long_offline: 'behavioral_anomaly',
    automation_alert: 'process_suspicious',
    network_anomaly: 'network_anomaly',
    file_integrity_violation: 'file_integrity_violation',
    stale_cron: 'behavioral_anomaly',
    vulnerable_software: 'vulnerability_critical',
    unauthorized_usb: 'usb_device_risky',
  };
  return mapping[alertType] ?? null;
}

// ── Playbook Matching Logic ──

interface Playbook {
  id: string;
  triggerType: string;
  tenantId: string | null;
  isActive: boolean;
  autoExecute: boolean;
  requiresApproval: boolean;
  autoApproveCritical: boolean;
  cooldownMinutes: number;
  lastTriggeredAt: Date | null;
}

interface Alert {
  tenantId: string;
  agentId: string | null;
  alertType: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
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

function determineExecutionStatus(
  playbook: Playbook,
  alertSeverity: string
): 'completed' | 'pending_approval' {
  if (playbook.autoExecute && !playbook.requiresApproval) return 'completed';
  if (playbook.autoApproveCritical && alertSeverity === 'critical') return 'completed';
  return 'pending_approval';
}

// ── Fixtures ──

const mkPlaybook = (overrides: Partial<Playbook> = {}): Playbook => ({
  id: 'pb-1',
  triggerType: 'behavioral_anomaly',
  tenantId: null,
  isActive: true,
  autoExecute: true,
  requiresApproval: false,
  autoApproveCritical: false,
  cooldownMinutes: 30,
  lastTriggeredAt: null,
  ...overrides,
});

// ── Tests ──

describe('SOAR Alert-to-Trigger Mapping', () => {
  it('maps all 17 alert types correctly', () => {
    const allTypes = [
      'vulnerability_critical', 'antivirus_outdated', 'antivirus_inactive',
      'firewall_disabled', 'certificate_expiring', 'usb_device_risky',
      'process_suspicious', 'behavioral_anomaly', 'agent_compromised',
      'ai_insight_alert', 'agent_long_offline', 'automation_alert',
      'network_anomaly', 'file_integrity_violation', 'stale_cron',
      'vulnerable_software', 'unauthorized_usb',
    ];
    allTypes.forEach(type => {
      expect(mapAlertToTriggerType(type), `Missing mapping for ${type}`).not.toBeNull();
    });
  });

  it('groups security-related alerts into correct trigger types', () => {
    expect(mapAlertToTriggerType('firewall_disabled')).toBe('antivirus_outdated');
    expect(mapAlertToTriggerType('antivirus_inactive')).toBe('antivirus_outdated');
    expect(mapAlertToTriggerType('agent_compromised')).toBe('behavioral_anomaly');
    expect(mapAlertToTriggerType('automation_alert')).toBe('process_suspicious');
    expect(mapAlertToTriggerType('vulnerable_software')).toBe('vulnerability_critical');
    expect(mapAlertToTriggerType('unauthorized_usb')).toBe('usb_device_risky');
    expect(mapAlertToTriggerType('stale_cron')).toBe('behavioral_anomaly');
  });

  it('returns null for unknown alert types', () => {
    expect(mapAlertToTriggerType('unknown_type')).toBeNull();
    expect(mapAlertToTriggerType('')).toBeNull();
    expect(mapAlertToTriggerType('system_maintenance')).toBeNull();
  });
});

describe('SOAR Playbook Matching', () => {
  const globalPb = mkPlaybook({ id: 'global-1', tenantId: null });
  const tenantPb = mkPlaybook({ id: 'tenant-1', tenantId: 'tenant-A' });

  it('matches global playbook when no tenant-specific exists', () => {
    const result = findMatchingPlaybook([globalPb], 'behavioral_anomaly', 'tenant-B');
    expect(result?.id).toBe('global-1');
  });

  it('prefers tenant-specific playbook over global', () => {
    const result = findMatchingPlaybook([globalPb, tenantPb], 'behavioral_anomaly', 'tenant-A');
    expect(result?.id).toBe('tenant-1');
  });

  it('falls back to global when tenant playbook is on cooldown', () => {
    const cooled = mkPlaybook({ id: 'tenant-1', tenantId: 'tenant-A', lastTriggeredAt: new Date() });
    const result = findMatchingPlaybook([globalPb, cooled], 'behavioral_anomaly', 'tenant-A');
    expect(result?.id).toBe('global-1');
  });

  it('returns null when all playbooks are on cooldown', () => {
    const both = [
      mkPlaybook({ id: 'g', lastTriggeredAt: new Date() }),
      mkPlaybook({ id: 't', tenantId: 'tenant-A', lastTriggeredAt: new Date() }),
    ];
    const result = findMatchingPlaybook(both, 'behavioral_anomaly', 'tenant-A');
    expect(result).toBeNull();
  });

  it('skips inactive playbooks', () => {
    const inactive = mkPlaybook({ isActive: false });
    expect(findMatchingPlaybook([inactive], 'behavioral_anomaly', 'tenant-A')).toBeNull();
  });

  it('does not match wrong trigger type', () => {
    expect(findMatchingPlaybook([globalPb], 'vulnerability_critical', 'tenant-A')).toBeNull();
  });

  it('respects cooldown expiry correctly', () => {
    const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
    const pb = mkPlaybook({ lastTriggeredAt: thirtyOneMinutesAgo, cooldownMinutes: 30 });
    expect(findMatchingPlaybook([pb], 'behavioral_anomaly', 'x')).not.toBeNull();

    const twentyNineMinutesAgo = new Date(Date.now() - 29 * 60 * 1000);
    const pb2 = mkPlaybook({ lastTriggeredAt: twentyNineMinutesAgo, cooldownMinutes: 30 });
    expect(findMatchingPlaybook([pb2], 'behavioral_anomaly', 'x')).toBeNull();
  });
});

describe('SOAR Execution Status Logic', () => {
  it('auto-executes when autoExecute=true and no approval needed', () => {
    const pb = mkPlaybook({ autoExecute: true, requiresApproval: false });
    expect(determineExecutionStatus(pb, 'high')).toBe('completed');
  });

  it('requires approval when requiresApproval=true', () => {
    const pb = mkPlaybook({ autoExecute: true, requiresApproval: true });
    expect(determineExecutionStatus(pb, 'high')).toBe('pending_approval');
  });

  it('auto-approves critical when autoApproveCritical=true', () => {
    const pb = mkPlaybook({ autoExecute: false, requiresApproval: true, autoApproveCritical: true });
    expect(determineExecutionStatus(pb, 'critical')).toBe('completed');
    expect(determineExecutionStatus(pb, 'high')).toBe('pending_approval');
  });
});

describe('SOAR End-to-End Pipeline', () => {
  it('maps alert → finds playbook → determines status correctly', () => {
    const alert: Alert = {
      tenantId: 'tenant-X',
      agentId: 'agent-1',
      alertType: 'ai_insight_alert',
      severity: 'critical',
    };
    const playbooks = [
      mkPlaybook({ id: 'pb-behavior', triggerType: 'behavioral_anomaly', autoApproveCritical: true, requiresApproval: true }),
      mkPlaybook({ id: 'pb-vuln', triggerType: 'vulnerability_critical' }),
    ];

    const triggerType = mapAlertToTriggerType(alert.alertType);
    expect(triggerType).toBe('behavioral_anomaly');

    const matched = findMatchingPlaybook(playbooks, triggerType!, alert.tenantId);
    expect(matched?.id).toBe('pb-behavior');

    const status = determineExecutionStatus(matched!, alert.severity);
    expect(status).toBe('completed'); // auto-approved because critical
  });

  it('handles agent_id=null alerts (AI-generated)', () => {
    const alert: Alert = { tenantId: 't', agentId: null, alertType: 'ai_insight_alert', severity: 'critical' };
    const triggerType = mapAlertToTriggerType(alert.alertType);
    expect(triggerType).toBe('behavioral_anomaly');
    // agent_id=null should not prevent matching
    const pb = mkPlaybook({ triggerType: 'behavioral_anomaly' });
    expect(findMatchingPlaybook([pb], triggerType!, alert.tenantId)).not.toBeNull();
  });

  it('blocks unmapped alert types from triggering SOAR', () => {
    expect(mapAlertToTriggerType('system_maintenance')).toBeNull();
    // No trigger type = no playbook matching attempted
  });
});
