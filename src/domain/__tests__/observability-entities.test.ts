import { describe, it, expect } from 'vitest';
import { ProcessSnapshot } from '../entities/ProcessSnapshot';
import { HardwareMetrics, CpuMetrics, MemoryMetrics, DiskMetrics } from '../entities/HardwareMetrics';
import { NetworkSnapshot } from '../entities/NetworkSnapshot';
import { AutomationRule } from '../entities/AutomationRule';
import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';

const agentId = AgentId.generate();
const tenantId = TenantId.create('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee').value;

// ── ProcessSnapshot ──

describe('ProcessSnapshot', () => {
  const processes = [
    { pid: 1, name: 'svchost.exe', cpuPercent: 5, memoryMb: 100, user: 'SYSTEM' },
    { pid: 2, name: 'malware.exe', cpuPercent: 90, memoryMb: 500, user: 'Admin', commandLine: 'C:\\temp\\malware.exe' },
  ];
  const services = [
    { name: 'Spooler', displayName: 'Print Spooler', status: 'Running' as const, startupType: 'Automatic' as const },
    { name: 'wuauserv', displayName: 'Windows Update', status: 'Stopped' as const, startupType: 'Manual' as const },
  ];

  it('creates with valid data', () => {
    const result = ProcessSnapshot.create(agentId, tenantId, processes, services);
    expect(result.isSuccess).toBe(true);
    expect(result.value.totalProcesses).toBe(2);
    expect(result.value.totalServices).toBe(2);
    expect(result.value.servicesRunning).toBe(1);
    expect(result.value.servicesStopped).toBe(1);
  });

  it('rejects without agentId', () => {
    const result = ProcessSnapshot.create(null as unknown, tenantId, processes, services);
    expect(result.isFailure).toBe(true);
  });

  it('detects new processes', () => {
    const snap1 = ProcessSnapshot.create(agentId, tenantId, [processes[0]], services).value;
    const snap2 = ProcessSnapshot.create(agentId, tenantId, processes, services).value;
    snap2.detectNewProcesses(snap1);
    expect(snap2.hasNewProcesses).toBe(true);
    expect(snap2.newProcesses.length).toBe(1);
    expect(snap2.newProcesses[0].name).toBe('malware.exe');
  });

  it('detects suspicious processes', () => {
    const snap = ProcessSnapshot.create(agentId, tenantId, processes, services).value;
    snap.detectSuspiciousProcesses(['\\temp\\', '\\downloads\\']);
    expect(snap.hasSuspiciousActivity).toBe(true);
    expect(snap.suspiciousProcesses.length).toBe(1);
  });
});

// ── HardwareMetrics ──

describe('HardwareMetrics', () => {
  function makeCpu(usage: number) {
    return CpuMetrics.create({ usagePercent: usage, cores: 4 });
  }
  function makeMem(usage: number) {
    return MemoryMetrics.create({ totalGb: 16, usedGb: usage * 0.16, freeGb: 16 - usage * 0.16, usagePercent: usage });
  }
  function makeDisk(usage: number) {
    return DiskMetrics.create({ totalGb: 500, usedGb: usage * 5, freeGb: 500 - usage * 5, usagePercent: usage });
  }

  it('creates with valid data', () => {
    const result = HardwareMetrics.create(
      agentId, tenantId,
      makeCpu(50).value, makeMem(60).value, makeDisk(70).value,
      3600, 'Windows 11', 'WORKSTATION-01'
    );
    expect(result.isSuccess).toBe(true);
    expect(result.value.hasCriticalMetrics).toBe(false);
    expect(result.value.hasWarningMetrics).toBe(false);
  });

  it('detects critical CPU', () => {
    const result = HardwareMetrics.create(
      agentId, tenantId,
      makeCpu(95).value, makeMem(50).value, makeDisk(50).value,
      3600, 'Windows 11', 'WK-01'
    );
    expect(result.value.hasCriticalMetrics).toBe(true);
    expect(result.value.cpu.isCritical).toBe(true);
  });

  it('detects warning memory', () => {
    const result = HardwareMetrics.create(
      agentId, tenantId,
      makeCpu(50).value, makeMem(85).value, makeDisk(50).value,
      3600, 'Windows 11', 'WK-01'
    );
    expect(result.value.hasWarningMetrics).toBe(true);
    expect(result.value.memory.isWarning).toBe(true);
  });

  it('calculates health score', () => {
    const result = HardwareMetrics.create(
      agentId, tenantId,
      makeCpu(0).value, makeMem(0).value, makeDisk(0).value,
      3600, 'Windows 11', 'WK-01'
    );
    expect(result.value.healthScore).toBe(100);
  });

  it('rejects negative uptime', () => {
    const result = HardwareMetrics.create(
      agentId, tenantId,
      makeCpu(50).value, makeMem(50).value, makeDisk(50).value,
      -1, 'Windows 11', 'WK-01'
    );
    expect(result.isFailure).toBe(true);
  });

  it('rejects invalid CPU range', () => {
    const result = CpuMetrics.create({ usagePercent: 150, cores: 4 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects invalid memory range', () => {
    const result = MemoryMetrics.create({ totalGb: -1, usedGb: 0, freeGb: 0, usagePercent: 0 });
    expect(result.isFailure).toBe(true);
  });
});

// ── NetworkSnapshot ──

describe('NetworkSnapshot', () => {
  it('creates with valid data', () => {
    const result = NetworkSnapshot.create(agentId, tenantId, {
      firewallDomain: true,
      firewallPrivate: true,
      firewallPublic: true,
      openPorts: [{ port: 80, process: 'httpd', protocol: 'TCP' }],
      activeConnections: [],
      networkAdapters: [{ name: 'eth0', ipAddress: '192.168.1.1', macAddress: 'AA:BB:CC:DD:EE:FF', status: 'Up' }],
      dnsServers: ['8.8.8.8'],
      gatewayIp: '192.168.1.1',
      publicIp: '1.2.3.4',
      dnsTestSuccess: true,
      httpsTestSuccess: true,
    });
    expect(result.isSuccess).toBe(true);
    expect(result.value.isFullyFirewalled).toBe(true);
    expect(result.value.hasFirewallGap).toBe(false);
    expect(result.value.hasConnectivityIssues).toBe(false);
  });

  it('detects firewall gap', () => {
    const result = NetworkSnapshot.create(agentId, tenantId, {
      firewallDomain: true,
      firewallPrivate: false,
      firewallPublic: true,
      openPorts: [],
      activeConnections: [],
      networkAdapters: [],
      dnsServers: [],
      gatewayIp: null,
      publicIp: null,
      dnsTestSuccess: true,
      httpsTestSuccess: true,
    });
    expect(result.value.hasFirewallGap).toBe(true);
    expect(result.value.isFullyFirewalled).toBe(false);
  });

  it('detects risky ports', () => {
    const result = NetworkSnapshot.create(agentId, tenantId, {
      firewallDomain: true, firewallPrivate: true, firewallPublic: true,
      openPorts: [
        { port: 3389, process: 'svchost', protocol: 'TCP' },
        { port: 445, process: 'System', protocol: 'TCP' },
        { port: 443, process: 'httpd', protocol: 'TCP' },
      ],
      activeConnections: [], networkAdapters: [], dnsServers: [],
      gatewayIp: null, publicIp: null, dnsTestSuccess: true, httpsTestSuccess: true,
    });
    expect(result.value.riskyPorts.length).toBe(2); // 3389 + 445
  });

  it('detects connectivity issues', () => {
    const result = NetworkSnapshot.create(agentId, tenantId, {
      firewallDomain: true, firewallPrivate: true, firewallPublic: true,
      openPorts: [], activeConnections: [], networkAdapters: [], dnsServers: [],
      gatewayIp: null, publicIp: null, dnsTestSuccess: false, httpsTestSuccess: true,
    });
    expect(result.value.hasConnectivityIssues).toBe(true);
  });
});

// ── AutomationRule ──

describe('AutomationRule', () => {
  it('creates with valid data', () => {
    const result = AutomationRule.create(
      tenantId, 'CPU Alert Rule', 'metric_threshold',
      { metric: 'cpu_usage_percent', operator: '>', value: 90 },
      'send_alert', {}
    );
    expect(result.isSuccess).toBe(true);
    expect(result.value.isActive).toBe(true);
    expect(result.value.triggerCount).toBe(0);
  });

  it('rejects short name', () => {
    const result = AutomationRule.create(tenantId, 'AB', 'metric_threshold', {}, 'send_alert', {});
    expect(result.isFailure).toBe(true);
  });

  it('rejects invalid priority', () => {
    const result = AutomationRule.create(tenantId, 'Test Rule', 'metric_threshold', {}, 'send_alert', {}, { priority: 0 });
    expect(result.isFailure).toBe(true);
  });

  it('rejects invalid cooldown', () => {
    const result = AutomationRule.create(tenantId, 'Test Rule', 'metric_threshold', {}, 'send_alert', {}, { cooldownMinutes: 0 });
    expect(result.isFailure).toBe(true);
  });

  it('evaluates metric threshold correctly', () => {
    const rule = AutomationRule.create(
      tenantId, 'CPU > 90', 'metric_threshold',
      { metric: 'cpu_usage_percent', operator: '>', value: 90 },
      'send_alert', {}
    ).value;

    expect(rule.evaluateMetric('cpu_usage_percent', 95)).toBe(true);
    expect(rule.evaluateMetric('cpu_usage_percent', 85)).toBe(false);
    expect(rule.evaluateMetric('memory_usage_percent', 95)).toBe(false);
  });

  it('respects cooldown', () => {
    const rule = AutomationRule.create(
      tenantId, 'CPU Alert', 'metric_threshold',
      { metric: 'cpu_usage_percent', operator: '>', value: 90 },
      'send_alert', {}, { cooldownMinutes: 60 }
    ).value;

    expect(rule.isInCooldown()).toBe(false);
    rule.recordTrigger();
    expect(rule.isInCooldown()).toBe(true);
    expect(rule.triggerCount).toBe(1);
  });

  it('applies scope correctly', () => {
    const rule = AutomationRule.create(
      tenantId, 'Specific Agent', 'metric_threshold',
      { metric: 'cpu_usage_percent', operator: '>', value: 90 },
      'send_alert', {},
      { targetScope: 'specific_agent', targetIds: ['agent-1'] }
    ).value;

    expect(rule.appliesTo('agent-1')).toBe(true);
    expect(rule.appliesTo('agent-2')).toBe(false);
  });

  it('all_agents scope applies to any agent', () => {
    const rule = AutomationRule.create(
      tenantId, 'All Agents', 'metric_threshold', {}, 'send_alert', {}
    ).value;

    expect(rule.appliesTo('any-agent')).toBe(true);
  });

  it('activates and deactivates', () => {
    const rule = AutomationRule.create(tenantId, 'Test Rule', 'metric_threshold', {}, 'send_alert', {}).value;
    rule.deactivate();
    expect(rule.isActive).toBe(false);
    expect(rule.evaluateMetric('cpu_usage_percent', 95)).toBe(false);
    rule.activate();
    expect(rule.isActive).toBe(true);
  });

  it('supports != operator', () => {
    const rule = AutomationRule.create(
      tenantId, 'Not Equal', 'metric_threshold',
      { metric: 'cpu_usage_percent', operator: '!=', value: 0 },
      'send_alert', {}
    ).value;

    expect(rule.evaluateMetric('cpu_usage_percent', 50)).toBe(true);
    expect(rule.evaluateMetric('cpu_usage_percent', 0)).toBe(false);
  });
});
