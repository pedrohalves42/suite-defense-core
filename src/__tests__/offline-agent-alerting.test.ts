import { describe, it, expect } from 'vitest';
import {
  ALERT_LONG_THRESHOLD_HOURS,
  ALERT_SHORT_THRESHOLD_SECONDS,
} from '../../supabase/functions/_shared/agent-lifecycle/heartbeat-thresholds';

/**
 * Offline Agent Alerting Logic Tests
 * Validates:
 *   - long-offline detection (>= ALERT_LONG_THRESHOLD_HOURS, default 48h)
 *   - short-offline detection (>= ALERT_SHORT_THRESHOLD_SECONDS, default 180s)
 *     — P0-02 canonical fix: alert <= 3 * heartbeat_interval.
 */

interface Agent {
  id: string;
  agentName: string;
  tenantId: string;
  status: string;
  lastHeartbeat: Date | null;
}

interface ExistingAlert {
  agentId: string;
  alertType: string;
  resolved: boolean;
}

function detectLongOfflineAgents(
  agents: Agent[],
  existingAlerts: ExistingAlert[],
  now: Date = new Date()
): Agent[] {
  const threshold48h = ALERT_LONG_THRESHOLD_HOURS * 60 * 60 * 1000;

  return agents.filter(agent => {
    if (agent.status !== 'inactive') return false;
    if (!agent.lastHeartbeat) return false;
    
    const offlineDuration = now.getTime() - agent.lastHeartbeat.getTime();
    if (offlineDuration < threshold48h) return false;

    // Check dedup
    const hasExistingAlert = existingAlerts.some(
      a => a.agentId === agent.id && a.alertType === 'agent_long_offline' && !a.resolved
    );
    return !hasExistingAlert;
  });
}

describe('Offline Agent Detection', () => {
  const now = new Date('2026-02-24T20:00:00Z');

  const onlineAgent: Agent = {
    id: 'agent-1',
    agentName: 'PC-Online',
    tenantId: 'tenant-A',
    status: 'active',
    lastHeartbeat: new Date('2026-02-24T19:55:00Z'),
  };

  const recentlyOffline: Agent = {
    id: 'agent-2',
    agentName: 'PC-Recent',
    tenantId: 'tenant-A',
    status: 'inactive',
    lastHeartbeat: new Date('2026-02-24T18:00:00Z'), // 2h ago
  };

  const longOffline: Agent = {
    id: 'agent-3',
    agentName: 'PC-Amanda',
    tenantId: 'tenant-A',
    status: 'inactive',
    lastHeartbeat: new Date('2026-02-18T18:48:00Z'), // 6 days ago
  };

  const noHeartbeat: Agent = {
    id: 'agent-4',
    agentName: 'PC-NoHB',
    tenantId: 'tenant-A',
    status: 'inactive',
    lastHeartbeat: null,
  };

  it('detects agents offline >48h', () => {
    const result = detectLongOfflineAgents([longOffline], [], now);
    expect(result).toHaveLength(1);
    expect(result[0].agentName).toBe('PC-Amanda');
  });

  it('ignores active agents', () => {
    const result = detectLongOfflineAgents([onlineAgent], [], now);
    expect(result).toHaveLength(0);
  });

  it('ignores recently offline agents (<48h)', () => {
    const result = detectLongOfflineAgents([recentlyOffline], [], now);
    expect(result).toHaveLength(0);
  });

  it('ignores agents without heartbeat', () => {
    const result = detectLongOfflineAgents([noHeartbeat], [], now);
    expect(result).toHaveLength(0);
  });

  it('skips agents with existing unresolved alert (dedup)', () => {
    const existingAlerts: ExistingAlert[] = [
      { agentId: 'agent-3', alertType: 'agent_long_offline', resolved: false },
    ];
    const result = detectLongOfflineAgents([longOffline], existingAlerts, now);
    expect(result).toHaveLength(0);
  });

  it('re-alerts if previous alert was resolved', () => {
    const existingAlerts: ExistingAlert[] = [
      { agentId: 'agent-3', alertType: 'agent_long_offline', resolved: true },
    ];
    const result = detectLongOfflineAgents([longOffline], existingAlerts, now);
    expect(result).toHaveLength(1);
  });

  it('handles mixed fleet correctly', () => {
    const result = detectLongOfflineAgents(
      [onlineAgent, recentlyOffline, longOffline, noHeartbeat],
      [],
      now
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('agent-3');
  });
});

// ---------------------------------------------------------------------------
// P0-02: Short-offline detection (alert <= 3 * heartbeat_interval).
// Mirrors supabase migration `alert_short_offline_agents()` behavior.
// ---------------------------------------------------------------------------

function detectShortOfflineAgents(
  agents: Agent[],
  existingAlerts: ExistingAlert[],
  now: Date = new Date()
): Agent[] {
  const shortMs = ALERT_SHORT_THRESHOLD_SECONDS * 1000;
  const longMs = ALERT_LONG_THRESHOLD_HOURS * 60 * 60 * 1000;

  return agents.filter(agent => {
    if (agent.status !== 'offline') return false;
    if (!agent.lastHeartbeat) return false;

    const offline = now.getTime() - agent.lastHeartbeat.getTime();
    // In the short window: >= shortMs and < longMs (long alert takes over past 48h)
    if (offline < shortMs || offline >= longMs) return false;

    const dup = existingAlerts.some(
      a => a.agentId === agent.id && a.alertType === 'agent_short_offline' && !a.resolved
    );
    return !dup;
  });
}

describe('P0-02 · Short-offline detection', () => {
  const now = new Date('2026-07-10T12:00:00Z');
  const mk = (id: string, hbSecondsAgo: number, status = 'offline'): Agent => ({
    id,
    agentName: `agent-${id}`,
    tenantId: 'tenant-A',
    status,
    lastHeartbeat: new Date(now.getTime() - hbSecondsAgo * 1000),
  });

  it('does NOT alert for a healthy heartbeat (<3x interval)', () => {
    const res = detectShortOfflineAgents([mk('a', 60, 'active')], [], now);
    expect(res).toHaveLength(0);
  });

  it('does NOT alert exactly at threshold - 1 second', () => {
    const res = detectShortOfflineAgents(
      [mk('a', ALERT_SHORT_THRESHOLD_SECONDS - 1)],
      [],
      now
    );
    expect(res).toHaveLength(0);
  });

  it('DOES alert when offline > 3x interval', () => {
    const res = detectShortOfflineAgents(
      [mk('a', ALERT_SHORT_THRESHOLD_SECONDS + 60)],
      [],
      now
    );
    expect(res).toHaveLength(1);
    expect(res[0].id).toBe('a');
  });

  it('dedups when an unresolved short-alert already exists', () => {
    const res = detectShortOfflineAgents(
      [mk('a', ALERT_SHORT_THRESHOLD_SECONDS + 60)],
      [{ agentId: 'a', alertType: 'agent_short_offline', resolved: false }],
      now
    );
    expect(res).toHaveLength(0);
  });

  it('re-alerts after resolved (heartbeat recovered then lost again)', () => {
    const res = detectShortOfflineAgents(
      [mk('a', ALERT_SHORT_THRESHOLD_SECONDS + 60)],
      [{ agentId: 'a', alertType: 'agent_short_offline', resolved: true }],
      now
    );
    expect(res).toHaveLength(1);
  });

  it('yields to long-offline alert past 48h', () => {
    const res = detectShortOfflineAgents(
      [mk('a', ALERT_LONG_THRESHOLD_HOURS * 3600 + 10)],
      [],
      now
    );
    expect(res).toHaveLength(0);
  });
});
