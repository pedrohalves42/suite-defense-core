/**
 * Tests for all Supabase adapter repositories (adapters/supabase/).
 * These repos use the global `supabase` client, so we mock it via vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the global supabase client ──────────────────────────────
// Proxy-based mock: every method returns `this`, terminal methods are overrideable
function createChainProxy(overrides: Record<string, any> = {}): any {
  const handler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === 'then') return undefined; // prevent auto-await
      if (prop in overrides) return overrides[prop];
      // Default: return a function that returns the proxy (chainable)
      return (..._args: any[]) => proxy;
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

let terminalResolve: { data: any; error: any } = { data: null, error: null };
let insertResolve: { error: any } = { error: null };
let upsertResolve: { error: any } = { error: null };

const mockChain = createChainProxy({
  maybeSingle: () => Promise.resolve(terminalResolve),
  // For queries that end without maybeSingle (list queries), the last chainable
  // call is awaited. We use a special then to make the proxy thenable:
  then: undefined as any,
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(() => mockChain) },
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
  vi.clearAllMocks();
  // Reset default resolution
  for (const method of ['select', 'eq', 'neq', 'in', 'not', 'lt', 'lte', 'gte', 'order', 'limit']) {
    mockChain[method].mockReturnValue(mockChain);
  }
  mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockChain.insert.mockResolvedValue({ error: null });
  mockChain.upsert.mockResolvedValue({ error: null });
});

// ── BehavioralBaselineRepository ─────────────────────────────────
describe('SupabaseBehavioralBaselineRepository', () => {
  const repo = new SupabaseBehavioralBaselineRepository();

  const makeRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
    baseline_type: 'process_patterns', baseline_data: {}, mean_value: 50,
    std_deviation: 10, threshold_multiplier: 2.0, baseline_period_start: NOW,
    baseline_period_end: NOW, is_active: true, last_updated: NOW, created_at: NOW,
  });

  it('findActiveByAgent returns mapped baselines', async () => {
    mockChain.eq.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findActiveByAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  it('findActiveByAgent returns empty on error', async () => {
    mockChain.eq.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    await expect(repo.findActiveByAgent(AGENT_ID)).rejects.toThrow('fail');
  });

  it('findByAgentAndType returns null when no data', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    expect(result).toBeNull();
  });

  it('findByAgentAndType returns mapped baseline', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const result = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('process_patterns');
  });

  it('save calls upsert without error', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const baseline = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    mockChain.upsert.mockResolvedValueOnce({ error: null });
    await expect(repo.save(baseline!)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const baseline = await repo.findByAgentAndType(AGENT_ID, 'process_patterns' as any);
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'save fail' } });
    await expect(repo.save(baseline!)).rejects.toThrow('save fail');
  });
});

// ── CertificateRepository ────────────────────────────────────────
describe('SupabaseCertificateRepository', () => {
  const repo = new SupabaseCertificateRepository();

  const makeRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
    cert_store: 'personal', subject: 'CN=Test', issuer: 'CN=CA',
    thumbprint: 'AABB', serial_number: '1234',
    valid_from: NOW, valid_until: NOW, key_usage: [], is_self_signed: false,
    collected_at: NOW, created_at: NOW,
  });

  it('findByAgent returns certificates', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findByAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  it('findByAgent throws on error', async () => {
    mockChain.order.mockResolvedValueOnce({ data: null, error: { message: 'db err' } });
    await expect(repo.findByAgent(AGENT_ID)).rejects.toThrow('db err');
  });

  it('saveBatch skips empty array', async () => {
    await expect(repo.saveBatch([])).resolves.toBeUndefined();
  });

  it('saveBatch throws on error', async () => {
    mockChain.insert.mockResolvedValueOnce({ error: { message: 'batch fail' } });
    // Need a real certificate entity
    mockChain.order.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const certs = await repo.findByAgent(AGENT_ID);
    mockChain.insert.mockResolvedValueOnce({ error: { message: 'batch fail' } });
    await expect(repo.saveBatch(certs)).rejects.toThrow('batch fail');
  });

  it('findExpiringByTenant returns filtered certs', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findExpiringByTenant(TENANT_ID, 30);
    expect(result).toHaveLength(1);
  });
});

// ── FileIntegrityRepository ──────────────────────────────────────
describe('SupabaseFileIntegrityRepository', () => {
  const repo = new SupabaseFileIntegrityRepository();

  const makeRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
    file_path: '/etc/passwd', expected_hash: 'abc', actual_hash: 'abc',
    integrity_status: 'valid', scan_type: 'critical_files', severity: 'low',
    file_size: 1024, modified_at: NOW, collected_at: NOW, created_at: NOW,
  });

  it('findByAgent returns checks', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findByAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  it('findViolationsByTenant returns non-valid checks', async () => {
    const row = makeRow();
    row.integrity_status = 'modified';
    mockChain.limit.mockResolvedValueOnce({ data: [row], error: null });
    const result = await repo.findViolationsByTenant(TENANT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('modified');
  });

  it('saveBatch skips empty', async () => {
    await expect(repo.saveBatch([])).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'upsert fail' } });
    mockChain.limit.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const checks = await repo.findByAgent(AGENT_ID);
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'upsert fail' } });
    await expect(repo.save(checks[0])).rejects.toThrow('upsert fail');
  });
});

// ── UsbDeviceRepository ──────────────────────────────────────────
describe('SupabaseUsbDeviceRepository', () => {
  const repo = new SupabaseUsbDeviceRepository();

  const makeRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
    device_id: 'USB001', vendor_id: 'V1', product_id: 'P1',
    serial_number: 'SN1', device_name: 'Flash', device_type: 'storage',
    is_blocked: false, block_reason: null,
    first_seen: NOW, last_seen: NOW, collected_at: NOW, created_at: NOW,
  });

  it('findByAgent returns devices', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findByAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  it('findBlockedByTenant returns blocked devices', async () => {
    const row = makeRow();
    row.is_blocked = true;
    mockChain.eq.mockResolvedValueOnce({ data: [row], error: null });
    const result = await repo.findBlockedByTenant(TENANT_ID);
    expect(result).toHaveLength(1);
  });

  it('findByDeviceId returns null when no data', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await repo.findByDeviceId(AGENT_ID, 'USB001');
    expect(result).toBeNull();
  });

  it('findByDeviceId returns mapped device', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const result = await repo.findByDeviceId(AGENT_ID, 'USB001');
    expect(result).not.toBeNull();
    expect(result!.deviceId).toBe('USB001');
  });

  it('save throws on error', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'fail' } });
    mockChain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const device = await repo.findByDeviceId(AGENT_ID, 'USB001');
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'fail' } });
    await expect(repo.save(device!)).rejects.toThrow('fail');
  });
});

// ── VulnerabilityRepository ──────────────────────────────────────
describe('SupabaseVulnerabilityRepository', () => {
  const repo = new SupabaseVulnerabilityRepository();

  const makeRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
    cve_id: 'CVE-2024-1', software_name: 'OpenSSL',
    installed_version: '1.1', fixed_version: '1.2',
    severity: 'high', cvss_score: 8.5,
    remediation_status: 'pending', remediation_action: null,
    auto_remediated: false, detected_at: NOW, remediated_at: null,
    created_at: NOW,
  });

  it('findByAgent returns scans', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findByAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  it('findCriticalUnremediated returns filtered', async () => {
    const row = makeRow();
    row.severity = 'critical';
    mockChain.order.mockResolvedValueOnce({ data: [row], error: null });
    const result = await repo.findCriticalUnremediated(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  it('findByTenant returns scans', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findByTenant(TENANT_ID);
    expect(result).toHaveLength(1);
  });

  it('save throws on error', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'vuln fail' } });
    mockChain.limit.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const scans = await repo.findByAgent(AGENT_ID);
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'vuln fail' } });
    await expect(repo.save(scans[0])).rejects.toThrow('vuln fail');
  });
});

// ── NetworkMetricsRepository ─────────────────────────────────────
describe('SupabaseNetworkMetricsRepository', () => {
  const repo = new SupabaseNetworkMetricsRepository();

  const makeRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_ID.toString(), tenant_id: TENANT_ID.toString(),
    interface_name: 'eth0', bytes_sent: 100, bytes_received: 200,
    packets_sent: 10, packets_received: 20, errors_sent: 0, errors_received: 0,
    connections_active: 5, connections_listening: 2,
    collected_at: NOW, created_at: NOW,
  });

  it('findLatestByAgent returns metrics', async () => {
    mockChain.limit.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const result = await repo.findLatestByAgent(AGENT_ID);
    expect(result).toHaveLength(1);
  });

  it('saveBatch skips empty', async () => {
    await expect(repo.saveBatch([])).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    mockChain.insert.mockResolvedValueOnce({ error: { message: 'net fail' } });
    mockChain.limit.mockResolvedValueOnce({ data: [makeRow()], error: null });
    const metrics = await repo.findLatestByAgent(AGENT_ID);
    mockChain.insert.mockResolvedValueOnce({ error: { message: 'net fail' } });
    await expect(repo.save(metrics[0])).rejects.toThrow('net fail');
  });
});
