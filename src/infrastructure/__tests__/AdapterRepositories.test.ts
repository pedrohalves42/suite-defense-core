/**
 * Tests for all Supabase adapter repositories (adapters/supabase/).
 * These repos use the global `supabase` client, so we mock it via vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Chainable mock that supports any depth of chained calls ─────
let terminalResult: { data: any; error: any } = { data: null, error: null };
let writeResult: { error: any } = { error: null };

function chainable(): any {
  return new Proxy(() => {}, {
    apply: () => chainable(),
    get: (_t, prop) => {
      if (prop === 'then') return undefined;
      if (prop === 'maybeSingle') return () => Promise.resolve(terminalResult);
      if (prop === 'insert' || prop === 'upsert') return () => Promise.resolve(writeResult);
      // For terminal list queries, we need the chain to be thenable at the end
      return chainable();
    },
  });
}

// Track which table is queried
let lastTable = '';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      lastTable = table;
      return chainable();
    },
  },
}));

import { SupabaseBehavioralBaselineRepository } from '@/infrastructure/adapters/supabase/SupabaseBehavioralBaselineRepository';
import { SupabaseCertificateRepository } from '@/infrastructure/adapters/supabase/SupabaseCertificateRepository';
import { SupabaseFileIntegrityRepository } from '@/infrastructure/adapters/supabase/SupabaseFileIntegrityRepository';
import { SupabaseUsbDeviceRepository } from '@/infrastructure/adapters/supabase/SupabaseUsbDeviceRepository';
import { SupabaseVulnerabilityRepository } from '@/infrastructure/adapters/supabase/SupabaseVulnerabilityRepository';
import { SupabaseNetworkMetricsRepository } from '@/infrastructure/adapters/supabase/SupabaseNetworkMetricsRepository';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

const AGENT_ID = AgentId.create(crypto.randomUUID()).value;
const TENANT_ID = TenantId.create(crypto.randomUUID()).value;
const NOW = new Date().toISOString();

beforeEach(() => {
  terminalResult = { data: null, error: null };
  writeResult = { error: null };
});

// ── Helper rows ──────────────────────────────────────────────────
const makeBaselineRow = () => ({
  id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
  baseline_type: 'process_patterns', baseline_data: {}, mean_value: 50,
  std_deviation: 10, threshold_multiplier: 2.0, baseline_period_start: NOW,
  baseline_period_end: NOW, is_active: true, last_updated: NOW, created_at: NOW,
});

const makeCertRow = () => ({
  id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
  cert_store: 'personal', subject: 'CN=Test', issuer: 'CN=CA',
  thumbprint: 'AABB', serial_number: '1234',
  valid_from: NOW, valid_until: NOW, key_usage: [], is_self_signed: false,
  collected_at: NOW, created_at: NOW,
});

const makeFileIntegrityRow = () => ({
  id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
  file_path: '/etc/passwd', expected_hash: 'abc', actual_hash: 'abc',
  integrity_status: 'valid', scan_type: 'critical_files', severity: 'low',
  file_size: 1024, modified_at: NOW, collected_at: NOW, created_at: NOW,
});

const makeUsbRow = () => ({
  id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
  device_id: 'USB001', vendor_id: 'V1', product_id: 'P1',
  serial_number: 'SN1', device_name: 'Flash', device_type: 'storage',
  is_blocked: false, block_reason: null,
  first_seen: NOW, last_seen: NOW, collected_at: NOW, created_at: NOW,
});

const makeVulnRow = () => ({
  id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
  cve_id: 'CVE-2024-1', software_name: 'OpenSSL',
  installed_version: '1.1', fixed_version: '1.2',
  severity: 'high', cvss_score: 8.5,
  remediation_status: 'pending', remediation_action: null,
  auto_remediated: false, detected_at: NOW, remediated_at: null,
  created_at: NOW,
});

const makeNetworkRow = () => ({
  id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
  interface_name: 'eth0', bytes_sent: 100, bytes_received: 200,
  packets_sent: 10, packets_received: 20, errors_sent: 0, errors_received: 0,
  connections_active: 5, connections_listening: 2,
  collected_at: NOW, created_at: NOW,
});

// ── BehavioralBaselineRepository ─────────────────────────────────
describe('SupabaseBehavioralBaselineRepository', () => {
  const repo = new SupabaseBehavioralBaselineRepository();

  it('findByAgentAndType returns null when no data', async () => {
    terminalResult = { data: null, error: null };
    const result = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    expect(result).toBeNull();
  });

  it('findByAgentAndType returns mapped baseline', async () => {
    terminalResult = { data: makeBaselineRow(), error: null };
    const result = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('process_patterns');
  });

  it('findByAgentAndType throws on error', async () => {
    terminalResult = { data: null, error: { message: 'db fail' } };
    await expect(repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any)).rejects.toThrow('db fail');
  });

  it('save calls upsert without error', async () => {
    terminalResult = { data: makeBaselineRow(), error: null };
    const baseline = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    writeResult = { error: null };
    await expect(repo.save(baseline!)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    terminalResult = { data: makeBaselineRow(), error: null };
    const baseline = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    writeResult = { error: { message: 'save fail' } };
    await expect(repo.save(baseline!)).rejects.toThrow('save fail');
  });
});

// ── CertificateRepository ────────────────────────────────────────
describe('SupabaseCertificateRepository', () => {
  const repo = new SupabaseCertificateRepository();

  it('saveBatch skips empty array', async () => {
    await expect(repo.saveBatch([])).resolves.toBeUndefined();
  });

  it('save calls upsert', async () => {
    terminalResult = { data: makeCertRow(), error: null };
    // Use findByAgent (via maybeSingle proxy) indirectly — we'll get entity from mapper
    const { CertificateMapper } = await import('@/infrastructure/adapters/supabase/mappers/CertificateMapper');
    const cert = CertificateMapper.toDomain(makeCertRow());
    writeResult = { error: null };
    await expect(repo.save(cert)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    const { CertificateMapper } = await import('@/infrastructure/adapters/supabase/mappers/CertificateMapper');
    const cert = CertificateMapper.toDomain(makeCertRow());
    writeResult = { error: { message: 'cert fail' } };
    await expect(repo.save(cert)).rejects.toThrow('cert fail');
  });
});

// ── FileIntegrityRepository ──────────────────────────────────────
describe('SupabaseFileIntegrityRepository', () => {
  const repo = new SupabaseFileIntegrityRepository();

  it('saveBatch skips empty', async () => {
    await expect(repo.saveBatch([])).resolves.toBeUndefined();
  });

  it('save succeeds', async () => {
    const { FileIntegrityMapper } = await import('@/infrastructure/adapters/supabase/mappers/FileIntegrityMapper');
    const check = FileIntegrityMapper.toDomain(makeFileIntegrityRow());
    writeResult = { error: null };
    await expect(repo.save(check)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    const { FileIntegrityMapper } = await import('@/infrastructure/adapters/supabase/mappers/FileIntegrityMapper');
    const check = FileIntegrityMapper.toDomain(makeFileIntegrityRow());
    writeResult = { error: { message: 'fi fail' } };
    await expect(repo.save(check)).rejects.toThrow('fi fail');
  });
});

// ── UsbDeviceRepository ──────────────────────────────────────────
describe('SupabaseUsbDeviceRepository', () => {
  const repo = new SupabaseUsbDeviceRepository();

  it('findByDeviceId returns null when no data', async () => {
    terminalResult = { data: null, error: null };
    const result = await repo.findByDeviceId(AGENT_ID, 'USB001');
    expect(result).toBeNull();
  });

  it('findByDeviceId returns mapped device', async () => {
    terminalResult = { data: makeUsbRow(), error: null };
    const result = await repo.findByDeviceId(AGENT_ID, 'USB001');
    expect(result).not.toBeNull();
    expect(result!.deviceId).toBe('USB001');
  });

  it('findByDeviceId throws on error', async () => {
    terminalResult = { data: null, error: { message: 'usb err' } };
    await expect(repo.findByDeviceId(AGENT_ID, 'USB001')).rejects.toThrow('usb err');
  });

  it('save succeeds', async () => {
    const { UsbDeviceMapper } = await import('@/infrastructure/adapters/supabase/mappers/UsbDeviceMapper');
    const device = UsbDeviceMapper.toDomain(makeUsbRow());
    writeResult = { error: null };
    await expect(repo.save(device)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    const { UsbDeviceMapper } = await import('@/infrastructure/adapters/supabase/mappers/UsbDeviceMapper');
    const device = UsbDeviceMapper.toDomain(makeUsbRow());
    writeResult = { error: { message: 'usb save fail' } };
    await expect(repo.save(device)).rejects.toThrow('usb save fail');
  });
});

// ── VulnerabilityRepository ──────────────────────────────────────
describe('SupabaseVulnerabilityRepository', () => {
  const repo = new SupabaseVulnerabilityRepository();

  it('save succeeds', async () => {
    const { VulnerabilityScanMapper } = await import('@/infrastructure/adapters/supabase/mappers/VulnerabilityScanMapper');
    const scan = VulnerabilityScanMapper.toDomain(makeVulnRow());
    writeResult = { error: null };
    await expect(repo.save(scan)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    const { VulnerabilityScanMapper } = await import('@/infrastructure/adapters/supabase/mappers/VulnerabilityScanMapper');
    const scan = VulnerabilityScanMapper.toDomain(makeVulnRow());
    writeResult = { error: { message: 'vuln fail' } };
    await expect(repo.save(scan)).rejects.toThrow('vuln fail');
  });
});

// ── NetworkMetricsRepository ─────────────────────────────────────
describe('SupabaseNetworkMetricsRepository', () => {
  const repo = new SupabaseNetworkMetricsRepository();

  it('saveBatch skips empty', async () => {
    await expect(repo.saveBatch([])).resolves.toBeUndefined();
  });

  it('save succeeds', async () => {
    const { NetworkMetricsMapper } = await import('@/infrastructure/adapters/supabase/mappers/NetworkMetricsMapper');
    const metrics = NetworkMetricsMapper.toDomain(makeNetworkRow());
    writeResult = { error: null };
    await expect(repo.save(metrics)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    const { NetworkMetricsMapper } = await import('@/infrastructure/adapters/supabase/mappers/NetworkMetricsMapper');
    const metrics = NetworkMetricsMapper.toDomain(makeNetworkRow());
    writeResult = { error: { message: 'net fail' } };
    await expect(repo.save(metrics)).rejects.toThrow('net fail');
  });
});
