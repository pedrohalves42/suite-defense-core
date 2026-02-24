import { describe, it, expect } from 'vitest';

/**
 * Offline Agent Alerting Logic Tests
 * Validates the detection of long-offline agents (>48h)
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
  const threshold48h = 48 * 60 * 60 * 1000;

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
