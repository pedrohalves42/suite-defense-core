import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseAgentRepository } from '../repositories/SupabaseAgentRepository';
import { SupabaseJobRepository } from '../repositories/SupabaseJobRepository';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

// ── Supabase Client Mock ─────────────────────────────────────────
function createMockClient() {
  const chainable: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: undefined,
  };
  // Default resolution for terminal calls
  chainable.select.mockReturnValue(chainable);
  chainable.eq.mockReturnValue(chainable);
  chainable.in.mockReturnValue(chainable);
  chainable.lt.mockReturnValue(chainable);
  chainable.order.mockReturnValue(chainable);

  const client: any = {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
  return client;
}

const AGENT_ID = crypto.randomUUID();
const TENANT_ID = crypto.randomUUID();
const NOW = new Date().toISOString();

const makeAgentRow = () => ({
  id: AGENT_ID, tenant_id: TENANT_ID, agent_name: 'Test',
  os_type: 'windows', status: 'active', agent_version: '5.0.15',
  last_heartbeat: NOW, last_seen: NOW, hmac_secret: 'x'.repeat(64),
});

// ── SupabaseAgentRepository ──────────────────────────────────────
describe('SupabaseAgentRepository', () => {
  let client: any;
  let repo: SupabaseAgentRepository;

  beforeEach(() => {
    client = createMockClient();
    repo = new SupabaseAgentRepository(client);
  });

  it('findById returns null when no data', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const agent = await repo.findById(AgentId.create(AGENT_ID).value);
    expect(agent).toBeNull();
    expect(client.from).toHaveBeenCalledWith('agents');
  });

  it('findById returns mapped agent', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: makeAgentRow(), error: null });
    const agent = await repo.findById(AgentId.create(AGENT_ID).value);
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe('Test');
  });

  it('findById throws on error', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'db error' } });
    await expect(repo.findById(AgentId.create(AGENT_ID).value)).rejects.toThrow('db error');
  });

  it('findActiveByTenant returns array', async () => {
    // Override eq to resolve as a terminal query returning data array
    const resolvedChain = { ...client._chain };
    resolvedChain.eq = vi.fn().mockResolvedValue({ data: [makeAgentRow()], error: null });
    client._chain.eq.mockReturnValue(resolvedChain);

    const agents = await repo.findActiveByTenant(TenantId.create(TENANT_ID).value);
    expect(agents).toHaveLength(1);
  });

  it('save calls upsert', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: makeAgentRow(), error: null });
    const agent = await repo.findById(AgentId.create(AGENT_ID).value);
    
    client._chain.upsert.mockResolvedValue({ error: null });
    await expect(repo.save(agent!)).resolves.toBeUndefined();
    expect(client.from).toHaveBeenCalledWith('agents');
  });

  it('save throws on error', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: makeAgentRow(), error: null });
    const agent = await repo.findById(AgentId.create(AGENT_ID).value);
    
    client._chain.upsert.mockResolvedValue({ error: { message: 'constraint violation' } });
    await expect(repo.save(agent!)).rejects.toThrow('constraint violation');
  });

  it('delete calls delete with id', async () => {
    client._chain.eq.mockResolvedValue({ error: null });
    await expect(repo.delete(AgentId.create(AGENT_ID).value)).resolves.toBeUndefined();
  });

  it('delete throws on error', async () => {
    client._chain.eq.mockResolvedValue({ error: { message: 'fk violation' } });
    await expect(repo.delete(AgentId.create(AGENT_ID).value)).rejects.toThrow('fk violation');
  });
});

// ── SupabaseJobRepository ────────────────────────────────────────
describe('SupabaseJobRepository', () => {
  let client: any;
  let repo: SupabaseJobRepository;

  const makeJobRow = () => ({
    id: crypto.randomUUID(), agent_id: AGENT_ID, tenant_id: TENANT_ID,
    type: 'run_script', payload: { script: 'test' }, priority: 1,
    execution_time_seconds: 300, status: 'pending',
    retry_count: 0, delivery_attempts: 3,
    delivered_at: null, started_at: null, completed_at: null,
    output: null, error_message: null,
  });

  beforeEach(() => {
    client = createMockClient();
    repo = new SupabaseJobRepository(client);
  });

  it('findById returns null when no data', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const job = await repo.findById(crypto.randomUUID());
    expect(job).toBeNull();
  });

  it('findById returns mapped job', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: makeJobRow(), error: null });
    const job = await repo.findById('any');
    expect(job).not.toBeNull();
    expect(job!.type).toBe('run_script');
  });

  it('findById throws on error', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    await expect(repo.findById('any')).rejects.toThrow('timeout');
  });

  it('save calls upsert', async () => {
    client._chain.maybeSingle.mockResolvedValue({ data: makeJobRow(), error: null });
    const job = await repo.findById('any');
    
    client._chain.upsert.mockResolvedValue({ error: null });
    await expect(repo.save(job!)).resolves.toBeUndefined();
  });
});
