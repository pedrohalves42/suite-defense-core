/**
 * Tests for repositories/ that accept an injected SupabaseClient.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAgentUpdateRepository } from '../repositories/SupabaseAgentUpdateRepository';
import { SupabaseUpdatePackageRepository } from '../repositories/SupabaseUpdatePackageRepository';
import { AgentId } from '@/domain/value-objects/AgentId';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';

function createMockClient() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  for (const m of ['select', 'eq', 'not', 'in', 'lt', 'order', 'limit']) {
    chain[m].mockReturnValue(chain);
  }
  return { from: vi.fn(() => chain), _chain: chain } as any;
}

const AGENT_UUID = crypto.randomUUID();
const PKG_UUID = crypto.randomUUID();
const NOW = new Date().toISOString();

// ── AgentUpdateRepository ────────────────────────────────────────
describe('SupabaseAgentUpdateRepository', () => {
  let client: any;
  let repo: SupabaseAgentUpdateRepository;

  const makeRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_UUID, package_id: PKG_UUID,
    status: 'pending', download_started_at: null, download_completed_at: null,
    apply_started_at: null, apply_completed_at: null,
    error_message: null, rollback_reason: null,
    created_at: NOW, updated_at: NOW,
  });

  beforeEach(() => {
    client = createMockClient();
    repo = new SupabaseAgentUpdateRepository(client);
  });

  it('findById returns null when no data', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.findById('x')).toBeNull();
  });

  it('findById returns mapped entity', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const result = await repo.findById('x');
    expect(result).not.toBeNull();
    expect(result!.status).toBe('pending');
  });

  it('findById throws on error', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'err' } });
    await expect(repo.findById('x')).rejects.toThrow('err');
  });

  it('findActiveByAgentId returns null when no data', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.findActiveByAgentId(AgentId.create(AGENT_UUID).value)).toBeNull();
  });

  it('findActiveByAgentId returns active update', async () => {
    const row = makeRow();
    row.status = 'downloading';
    client._chain.maybeSingle.mockResolvedValueOnce({ data: row, error: null });
    const result = await repo.findActiveByAgentId(AgentId.create(AGENT_UUID).value);
    expect(result).not.toBeNull();
  });

  it('save calls upsert', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const entity = await repo.findById('x');
    client._chain.upsert.mockResolvedValueOnce({ error: null });
    await expect(repo.save(entity!)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const entity = await repo.findById('x');
    client._chain.upsert.mockResolvedValueOnce({ error: { message: 'save fail' } });
    await expect(repo.save(entity!)).rejects.toThrow('save fail');
  });
});

// ── UpdatePackageRepository ──────────────────────────────────────
describe('SupabaseUpdatePackageRepository (injected client)', () => {
  let client: any;
  let repo: SupabaseUpdatePackageRepository;

  const makeRow = () => ({
    id: PKG_UUID, version: '5.0.15', platform: 'windows', channel: 'stable',
    checksum: 'a'.repeat(64), script_content: 'x'.repeat(1001),
    size: 5000, release_notes: 'Fix bugs', is_active: true,
    signature_base64: null, signed_at: null, signed_by: null,
    min_version: null, max_version: null, created_at: NOW,
  });

  beforeEach(() => {
    client = createMockClient();
    repo = new SupabaseUpdatePackageRepository(client);
  });

  it('findById returns null when no data', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.findById(UpdatePackageId.create(PKG_UUID).value)).toBeNull();
  });

  it('findById returns mapped package', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const result = await repo.findById(UpdatePackageId.create(PKG_UUID).value);
    expect(result).not.toBeNull();
    expect(result!.version.normalized).toBe('5.0.15');
  });

  it('findById throws on error', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'pkg err' } });
    await expect(repo.findById(UpdatePackageId.create(PKG_UUID).value)).rejects.toThrow('pkg err');
  });

  it('findLatestActive returns null when no data', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await repo.findLatestActive('windows' as any, 'stable' as any)).toBeNull();
  });

  it('findLatestActive returns mapped package', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const result = await repo.findLatestActive('windows' as any, 'stable' as any);
    expect(result).not.toBeNull();
  });

  it('save calls upsert', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const pkg = await repo.findById(UpdatePackageId.create(PKG_UUID).value);
    client._chain.upsert.mockResolvedValueOnce({ error: null });
    await expect(repo.save(pkg!)).resolves.toBeUndefined();
  });

  it('save throws on error', async () => {
    client._chain.maybeSingle.mockResolvedValueOnce({ data: makeRow(), error: null });
    const pkg = await repo.findById(UpdatePackageId.create(PKG_UUID).value);
    client._chain.upsert.mockResolvedValueOnce({ error: { message: 'save fail' } });
    await expect(repo.save(pkg!)).rejects.toThrow('save fail');
  });
});
