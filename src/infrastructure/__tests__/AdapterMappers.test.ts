import { describe, it, expect } from 'vitest';
import { NetworkMetricsMapper } from '../adapters/supabase/mappers/NetworkMetricsMapper';
import { CertificateMapper } from '../adapters/supabase/mappers/CertificateMapper';
import { UsbDeviceMapper } from '../adapters/supabase/mappers/UsbDeviceMapper';
import { FileIntegrityMapper } from '../adapters/supabase/mappers/FileIntegrityMapper';
import { VulnerabilityScanMapper } from '../adapters/supabase/mappers/VulnerabilityScanMapper';
import { BehavioralBaselineMapper } from '../adapters/supabase/mappers/BehavioralBaselineMapper';
import { HardwareMetricsMapper } from '../adapters/supabase/mappers/HardwareMetricsMapper';
import { AutomationRuleMapper } from '../adapters/supabase/mappers/AutomationRuleMapper';
import { NetworkSnapshotMapper } from '../adapters/supabase/mappers/NetworkSnapshotMapper';
import { ProcessSnapshotMapper } from '../adapters/supabase/mappers/ProcessSnapshotMapper';
import { LightModeConfigMapper } from '../adapters/supabase/mappers/LightModeConfigMapper';

const UUID1 = crypto.randomUUID();
const UUID2 = crypto.randomUUID();
const NOW = new Date().toISOString();

// ── NetworkMetricsMapper ─────────────────────────────────────────
describe('NetworkMetricsMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    interface_name: 'eth0', bytes_sent: 100, bytes_received: 200,
    packets_sent: 10, packets_received: 20, errors_sent: 0, errors_received: 1,
    connections_active: 5, connections_listening: 2,
    collected_at: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps all fields', () => {
    const m = NetworkMetricsMapper.toDomain(makeRow());
    expect(m.interfaceName).toBe('eth0');
    expect(m.bytesSent).toBe(100);
    expect(m.errorsReceived).toBe(1);
  });

  it('toDomain defaults nulls to 0', () => {
    const m = NetworkMetricsMapper.toDomain(makeRow({
      bytes_sent: null, packets_sent: null, errors_sent: null,
      connections_active: null, connections_listening: null,
    }));
    expect(m.bytesSent).toBe(0);
    expect(m.connectionsActive).toBe(0);
  });

  it('toPersistence round-trips', () => {
    const entity = NetworkMetricsMapper.toDomain(makeRow());
    const p = NetworkMetricsMapper.toPersistence(entity);
    expect(p.interface_name).toBe('eth0');
    expect(p.bytes_sent).toBe(100);
    expect(p.collected_at).toBe(NOW);
  });
});

// ── CertificateMapper ────────────────────────────────────────────
describe('CertificateMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    cert_store: 'personal', subject: 'CN=Test', issuer: 'CN=CA',
    thumbprint: 'AABB', serial_number: '1234',
    valid_from: NOW, valid_until: NOW,
    key_usage: ['DigitalSignature'], is_self_signed: false,
    collected_at: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const c = CertificateMapper.toDomain(makeRow());
    expect(c.subject).toBe('CN=Test');
    expect(c.keyUsage).toEqual(['DigitalSignature']);
    expect(c.isSelfSigned).toBe(false);
  });

  it('toDomain handles null optionals', () => {
    const c = CertificateMapper.toDomain(makeRow({
      issuer: undefined, serial_number: undefined,
      valid_from: null, valid_until: null, key_usage: null, is_self_signed: null,
    }));
    expect(c.keyUsage).toEqual([]);
    expect(c.isSelfSigned).toBe(false);
    expect(c.validFrom).toBeUndefined();
  });

  it('toPersistence round-trips', () => {
    const entity = CertificateMapper.toDomain(makeRow());
    const p = CertificateMapper.toPersistence(entity);
    expect(p.subject).toBe('CN=Test');
    expect(p.thumbprint).toBe('AABB');
  });
});

// ── UsbDeviceMapper ──────────────────────────────────────────────
describe('UsbDeviceMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    device_id: 'USB001', vendor_id: 'V1', product_id: 'P1',
    serial_number: 'SN1', device_name: 'Flash Drive',
    device_type: 'storage', is_blocked: false, block_reason: undefined,
    first_seen: NOW, last_seen: NOW, collected_at: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const d = UsbDeviceMapper.toDomain(makeRow());
    expect(d.deviceId).toBe('USB001');
    expect(d.deviceType).toBe('storage');
    expect(d.isBlocked).toBe(false);
  });

  it('toDomain defaults nulls', () => {
    const d = UsbDeviceMapper.toDomain(makeRow({ device_type: null, is_blocked: null }));
    expect(d.deviceType).toBe('other');
    expect(d.isBlocked).toBe(false);
  });

  it('toPersistence round-trips', () => {
    const entity = UsbDeviceMapper.toDomain(makeRow());
    const p = UsbDeviceMapper.toPersistence(entity);
    expect(p.device_id).toBe('USB001');
    expect(p.first_seen).toBe(NOW);
  });
});

// ── FileIntegrityMapper ──────────────────────────────────────────
describe('FileIntegrityMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    file_path: '/etc/passwd', expected_hash: 'abc123', actual_hash: 'abc123',
    integrity_status: 'valid', scan_type: 'critical_files', severity: 'low',
    file_size: 1024, modified_at: NOW, collected_at: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const f = FileIntegrityMapper.toDomain(makeRow());
    expect(f.filePath).toBe('/etc/passwd');
    expect(f.status).toBe('valid');
    expect(f.fileSize).toBe(1024);
  });

  it('toDomain handles null expected_hash and status', () => {
    const f = FileIntegrityMapper.toDomain(makeRow({
      expected_hash: null, integrity_status: null, modified_at: null,
    }));
    expect(f.expectedHash).toBeNull();
    expect(f.status).toBe('unknown');
    expect(f.modifiedAt).toBeUndefined();
  });

  it('toPersistence round-trips', () => {
    const entity = FileIntegrityMapper.toDomain(makeRow());
    const p = FileIntegrityMapper.toPersistence(entity);
    expect(p.file_path).toBe('/etc/passwd');
    expect(p.integrity_status).toBe('valid');
  });
});

// ── VulnerabilityScanMapper ──────────────────────────────────────
describe('VulnerabilityScanMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    cve_id: 'CVE-2024-1234', software_name: 'OpenSSL',
    installed_version: '1.1.1', fixed_version: '1.1.2',
    severity: 'high', cvss_score: 8.5,
    remediation_status: 'pending', remediation_action: 'upgrade',
    auto_remediated: false, detected_at: NOW, remediated_at: null,
    created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const v = VulnerabilityScanMapper.toDomain(makeRow());
    expect(v.cveId).toBe('CVE-2024-1234');
    expect(v.cvssScore).toBe(8.5);
    expect(v.autoRemediated).toBe(false);
  });

  it('toDomain defaults nulls', () => {
    const v = VulnerabilityScanMapper.toDomain(makeRow({
      installed_version: null, severity: null, cvss_score: null,
      remediation_status: null, auto_remediated: null,
    }));
    expect(v.installedVersion).toBe('');
    expect(v.severity).toBe('medium');
    expect(v.cvssScore).toBe(0);
    expect(v.remediationStatus).toBe('pending');
  });

  it('toPersistence round-trips', () => {
    const entity = VulnerabilityScanMapper.toDomain(makeRow());
    const p = VulnerabilityScanMapper.toPersistence(entity);
    expect(p.cve_id).toBe('CVE-2024-1234');
    expect(p.severity).toBe('high');
  });
});

// ── BehavioralBaselineMapper ─────────────────────────────────────
describe('BehavioralBaselineMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    baseline_type: 'process_patterns', baseline_data: { key: 'val' },
    mean_value: 50, std_deviation: 10, threshold_multiplier: 2.5,
    baseline_period_start: NOW, baseline_period_end: NOW,
    is_active: true, last_updated: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const b = BehavioralBaselineMapper.toDomain(makeRow());
    expect(b.type).toBe('process_patterns');
    expect(b.thresholds.mean).toBe(50);
    expect(b.thresholds.multiplier).toBe(2.5);
    expect(b.isActive).toBe(true);
  });

  it('toDomain defaults nulls', () => {
    const b = BehavioralBaselineMapper.toDomain(makeRow({
      baseline_type: null, mean_value: null, std_deviation: null,
      threshold_multiplier: null, is_active: null,
      baseline_period_start: null, baseline_period_end: null,
    }));
    expect(b.thresholds.mean).toBe(0);
    expect(b.thresholds.stdDev).toBe(0);
    expect(b.thresholds.multiplier).toBe(2.0);
    expect(b.isActive).toBe(true);
  });

  it('toPersistence round-trips', () => {
    const entity = BehavioralBaselineMapper.toDomain(makeRow());
    const p = BehavioralBaselineMapper.toPersistence(entity);
    expect(p.baseline_type).toBe('process_patterns');
    expect(p.mean_value).toBe(50);
  });
});

// ── HardwareMetricsMapper ────────────────────────────────────────
describe('HardwareMetricsMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    cpu_usage_percent: 45, cpu_cores: 8, cpu_name: 'i9',
    memory_total_gb: 32, memory_used_gb: 16, memory_free_gb: 16, memory_usage_percent: 50,
    disk_total_gb: 500, disk_used_gb: 250, disk_free_gb: 250, disk_usage_percent: 50,
    uptime_seconds: 3600, os_version: 'Win11', hostname: 'PC1', os_build: '22621',
    collected_at: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const h = HardwareMetricsMapper.toDomain(makeRow());
    expect(h.cpu.usagePercent).toBe(45);
    expect(h.memory.totalGb).toBe(32);
    expect(h.disk.usagePercent).toBe(50);
    expect(h.uptimeSeconds).toBe(3600);
  });

  it('toDomain defaults nulls to safe values', () => {
    const h = HardwareMetricsMapper.toDomain(makeRow({
      cpu_usage_percent: null, cpu_cores: null,
      memory_total_gb: null, memory_used_gb: null, memory_free_gb: null, memory_usage_percent: null,
      disk_total_gb: null, disk_used_gb: null, disk_free_gb: null, disk_usage_percent: null,
      uptime_seconds: null, os_version: null, hostname: null,
    }));
    expect(h.cpu.usagePercent).toBe(0);
    expect(h.memory.totalGb).toBe(0);
    expect(h.uptimeSeconds).toBe(0);
  });

  it('toPersistence round-trips', () => {
    const entity = HardwareMetricsMapper.toDomain(makeRow());
    const p = HardwareMetricsMapper.toPersistence(entity);
    expect(p.cpu_usage_percent).toBe(45);
    expect(p.memory_total_gb).toBe(32);
  });
});

// ── AutomationRuleMapper ─────────────────────────────────────────
describe('AutomationRuleMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, tenant_id: crypto.randomUUID(), name: 'HighCPU',
    description: 'Alert on high CPU', is_active: true,
    trigger_type: 'metric_threshold',
    trigger_conditions: { metric: 'cpu', operator: '>', value: 90, duration_minutes: 5 },
    action_type: 'send_alert',
    action_config: { alert_channel: 'email' },
    target_scope: 'all_agents', target_ids: [],
    cooldown_minutes: 30, last_triggered_at: null,
    trigger_count: 5, priority: 3,
    created_by: 'admin', created_at: NOW, updated_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const r = AutomationRuleMapper.toDomain(makeRow());
    expect(r.name).toBe('HighCPU');
    expect(r.triggerType).toBe('metric_threshold');
    expect(r.triggerConditions.metric).toBe('cpu');
    expect(r.actionConfig.alertChannel).toBe('email');
  });

  it('toDomain handles null conditions/config', () => {
    const r = AutomationRuleMapper.toDomain(makeRow({
      trigger_conditions: null, action_config: null,
      cooldown_minutes: null, trigger_count: null, priority: null,
    }));
    expect(r.cooldownMinutes).toBe(30);
    expect(r.triggerCount).toBe(0);
    expect(r.priority).toBe(5);
  });

  it('toPersistence round-trips', () => {
    const entity = AutomationRuleMapper.toDomain(makeRow());
    const p = AutomationRuleMapper.toPersistence(entity);
    expect(p.name).toBe('HighCPU');
    expect(p.trigger_type).toBe('metric_threshold');
  });
});

// ── NetworkSnapshotMapper ────────────────────────────────────────
describe('NetworkSnapshotMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    firewall_domain: true, firewall_private: false, firewall_public: true,
    open_ports: [{ port: 443, process: 'nginx', protocol: 'TCP' }],
    active_connections: [{ remote_address: '1.2.3.4', remote_port: 80, state: 'ESTABLISHED' }],
    network_adapters: [{ name: 'eth0', ip_address: '10.0.0.1', mac_address: 'AA:BB', status: 'Up' }],
    dns_servers: ['8.8.8.8'], gateway_ip: '10.0.0.1', public_ip: '1.2.3.4',
    dns_test_success: true, https_test_success: true,
    collected_at: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const n = NetworkSnapshotMapper.toDomain(makeRow());
    expect(n.openPorts).toHaveLength(1);
    expect(n.openPorts[0].port).toBe(443);
    expect(n.networkAdapters[0].ipAddress).toBe('10.0.0.1');
  });

  it('toDomain handles empty arrays', () => {
    const n = NetworkSnapshotMapper.toDomain(makeRow({
      open_ports: null, active_connections: null, network_adapters: null, dns_servers: null,
    }));
    expect(n.openPorts).toEqual([]);
    expect(n.dnsServers).toEqual([]);
  });

  it('toPersistence round-trips', () => {
    const entity = NetworkSnapshotMapper.toDomain(makeRow());
    const p = NetworkSnapshotMapper.toPersistence(entity);
    expect((p.open_ports as any[])[0].port).toBe(443);
  });
});

// ── ProcessSnapshotMapper ────────────────────────────────────────
describe('ProcessSnapshotMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, tenant_id: crypto.randomUUID(),
    processes: [{ pid: 1, name: 'init', cpu_percent: 0.1, memory_mb: 10 }],
    services: [{ name: 'sshd', status: 'Running', display_name: 'SSH' }],
    new_processes: [], suspicious_processes: [],
    total_processes: 1, total_services: 1,
    services_running: 1, services_stopped: 0,
    collected_at: NOW, created_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const p = ProcessSnapshotMapper.toDomain(makeRow());
    expect(p.processes).toHaveLength(1);
    expect(p.processes[0].name).toBe('init');
    expect(p.totalProcesses).toBe(1);
  });

  it('toDomain handles null arrays', () => {
    const p = ProcessSnapshotMapper.toDomain(makeRow({
      processes: null, services: null, new_processes: null, suspicious_processes: null,
      total_processes: null, services_running: null,
    }));
    expect(p.processes).toEqual([]);
    expect(p.totalProcesses).toBe(0);
    expect(p.servicesRunning).toBe(0);
  });

  it('toPersistence round-trips', () => {
    const entity = ProcessSnapshotMapper.toDomain(makeRow());
    const p = ProcessSnapshotMapper.toPersistence(entity);
    expect((p.processes as any[])[0].name).toBe('init');
  });
});

// ── LightModeConfigMapper ────────────────────────────────────────
describe('LightModeConfigMapper', () => {
  const makeRow = (o: Record<string, unknown> = {}) => ({
    id: UUID1, agent_id: UUID2, is_active: true,
    activated_at: NOW, expires_at: null, reason: 'Teams call',
    collection_interval_seconds: 120, skip_process_collection: true,
    skip_network_collection: false, compress_payloads: true,
    cpu_threshold_percent: 60, network_threshold_mbps: 15,
    media_processes: ['Teams.exe'], duration_minutes: 30,
    reduced_interval_seconds: 900, active_media_processes: ['Teams.exe'],
    created_at: NOW, updated_at: NOW, ...o,
  });

  it('toDomain maps correctly', () => {
    const lm = LightModeConfigMapper.toDomain(makeRow());
    expect(lm.isActive).toBe(true);
    expect(lm.reason).toBe('Teams call');
    expect(lm.thresholds.cpuThresholdPercent).toBe(60);
    expect(lm.skipProcessCollection).toBe(true);
  });

  it('toDomain defaults nulls', () => {
    const lm = LightModeConfigMapper.toDomain(makeRow({
      is_active: null, reason: null, collection_interval_seconds: null,
      skip_process_collection: null, skip_network_collection: null, compress_payloads: null,
      cpu_threshold_percent: null, network_threshold_mbps: null, duration_minutes: null,
      reduced_interval_seconds: null, active_media_processes: null,
    }));
    expect(lm.isActive).toBe(false);
    expect(lm.collectionIntervalSeconds).toBe(60);
    expect(lm.thresholds.cpuThresholdPercent).toBe(50);
  });

  it('toPersistence round-trips', () => {
    const entity = LightModeConfigMapper.toDomain(makeRow());
    const p = LightModeConfigMapper.toPersistence(entity);
    expect(p.is_active).toBe(true);
    expect(p.cpu_threshold_percent).toBe(60);
  });

  it('throws on invalid agent_id', () => {
    expect(() => LightModeConfigMapper.toDomain(makeRow({ agent_id: 'bad' }))).toThrow();
  });
});
