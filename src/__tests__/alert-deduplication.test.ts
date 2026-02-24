import { describe, it, expect } from 'vitest';

/**
 * Alert Deduplication Logic Tests
 * Validates that duplicate alerts for the same agent+type are properly handled
 */

interface Alert {
  id: string;
  agentId: string | null;
  alertType: string;
  resolved: boolean;
  createdAt: Date;
}

/**
 * Simulates the deduplication logic from soar_evaluate_alert trigger.
 * Returns IDs of alerts that should be auto-resolved.
 */
function findDuplicateAlerts(alerts: Alert[], newAlert: Alert): string[] {
  if (!newAlert.agentId) return [];
  
  return alerts
    .filter(a => 
      a.agentId === newAlert.agentId &&
      a.alertType === newAlert.alertType &&
      !a.resolved &&
      a.id !== newAlert.id
    )
    .map(a => a.id);
}

describe('Alert Deduplication', () => {
  const baseAlert: Alert = {
    id: 'alert-1',
    agentId: 'agent-A',
    alertType: 'ai_insight_alert',
    resolved: false,
    createdAt: new Date('2026-02-24T06:00:00Z'),
  };

  it('identifies older duplicate alerts for same agent+type', () => {
    const existing = [baseAlert];
    const newAlert: Alert = {
      ...baseAlert,
      id: 'alert-2',
      createdAt: new Date('2026-02-24T12:00:00Z'),
    };

    const duplicates = findDuplicateAlerts(existing, newAlert);
    expect(duplicates).toEqual(['alert-1']);
  });

  it('does not flag alerts for different agents', () => {
    const existing = [baseAlert];
    const newAlert: Alert = {
      ...baseAlert,
      id: 'alert-2',
      agentId: 'agent-B',
    };

    const duplicates = findDuplicateAlerts(existing, newAlert);
    expect(duplicates).toEqual([]);
  });

  it('does not flag alerts of different types', () => {
    const existing = [baseAlert];
    const newAlert: Alert = {
      ...baseAlert,
      id: 'alert-2',
      alertType: 'firewall_disabled',
    };

    const duplicates = findDuplicateAlerts(existing, newAlert);
    expect(duplicates).toEqual([]);
  });

  it('does not flag already resolved alerts', () => {
    const resolved: Alert = { ...baseAlert, resolved: true };
    const newAlert: Alert = { ...baseAlert, id: 'alert-2' };

    const duplicates = findDuplicateAlerts([resolved], newAlert);
    expect(duplicates).toEqual([]);
  });

  it('skips dedup when agent_id is null', () => {
    const existing = [{ ...baseAlert, agentId: null }];
    const newAlert: Alert = { ...baseAlert, id: 'alert-2', agentId: null };

    const duplicates = findDuplicateAlerts(existing, newAlert);
    expect(duplicates).toEqual([]);
  });

  it('handles multiple duplicates', () => {
    const existing = [
      baseAlert,
      { ...baseAlert, id: 'alert-1b', createdAt: new Date('2026-02-24T08:00:00Z') },
      { ...baseAlert, id: 'alert-1c', createdAt: new Date('2026-02-24T10:00:00Z') },
    ];
    const newAlert: Alert = { ...baseAlert, id: 'alert-3' };

    const duplicates = findDuplicateAlerts(existing, newAlert);
    expect(duplicates).toHaveLength(3);
    expect(duplicates).toContain('alert-1');
    expect(duplicates).toContain('alert-1b');
    expect(duplicates).toContain('alert-1c');
  });
});
