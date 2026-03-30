import { describe, it, expect } from 'vitest';
import { AgentMapper } from '../mappers/AgentMapper';
import { AgentUpdateMapper } from '../mappers/AgentUpdateMapper';
import { UpdatePackageMapper } from '../mappers/UpdatePackageMapper';
import { JobMapper } from '../mappers/JobMapper';
import { AgentState, AgentStatus } from '@/domain/entities/Agent';
import { AgentUpdate } from '@/domain/entities/AgentUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { UpdateStatus } from '@/domain/constants';

describe('AgentMapper', () => {
  const makeRow = (overrides: any = {}) => ({
    id: crypto.randomUUID(),
    tenant_id: crypto.randomUUID(),
    agent_name: 'TestAgent',
    os_type: 'windows',
    status: 'active',
    agent_version: '5.0.3',
    last_heartbeat: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    hmac_secret: 'a'.repeat(64),
    ...overrides,
  });

  it('toDomain maps correctly', () => {
    const agent = AgentMapper.toDomain(makeRow());
    expect(agent.name).toBe('TestAgent');
    expect(agent.state).toBe(AgentState.ACTIVE);
    expect(agent.version.normalized).toBe('5.0.3');
  });

  it('toDomain handles null version', () => {
    const agent = AgentMapper.toDomain(makeRow({ agent_version: null }));
    expect(agent.version.value).toBe('0.0.0');
  });

  it('toDomain maps offline status for old last_seen', () => {
    const oldDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 60 min > 30 min threshold
    const agent = AgentMapper.toDomain(makeRow({ last_seen: oldDate }));
    expect(agent.status).toBe(AgentStatus.OFFLINE);
  });

  it('toDomain maps online status for recent last_seen', () => {
    const agent = AgentMapper.toDomain(makeRow({ last_seen: new Date().toISOString() }));
    expect(agent.status).toBe(AgentStatus.ONLINE);
  });

  it('toPersistence round-trips', () => {
    const row = makeRow();
    const agent = AgentMapper.toDomain(row);
    const persisted = AgentMapper.toPersistence(agent);
    expect(persisted.id).toBe(row.id);
    expect(persisted.agent_name).toBe('TestAgent');
    expect(persisted.os_type).toBe('windows');
  });

  it('maps decommissioned state', () => {
    const agent = AgentMapper.toDomain(makeRow({ status: 'decommissioned' }));
    expect(agent.state).toBe(AgentState.DECOMMISSIONED);
    expect(agent.status).toBe(AgentStatus.OFFLINE);
  });

  it('maps unknown status to enrolled', () => {
    const agent = AgentMapper.toDomain(makeRow({ status: 'unknown_state' }));
    expect(agent.state).toBe(AgentState.ENROLLED);
  });

  it('handles null hmac_secret gracefully', () => {
    const agent = AgentMapper.toDomain(makeRow({ hmac_secret: null }));
    expect(agent.hmacSecret).toBeDefined();
  });
});

describe('AgentUpdateMapper', () => {
  const makeRow = () => ({
    id: crypto.randomUUID(),
    agent_id: crypto.randomUUID(),
    package_id: crypto.randomUUID(),
    status: 'pending',
    download_started_at: null,
    download_completed_at: null,
    apply_started_at: null,
    apply_completed_at: null,
    error_message: null,
    rollback_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it('toDomain maps correctly', () => {
    const update = AgentUpdateMapper.toDomain(makeRow());
    expect(update.status).toBe(UpdateStatus.PENDING);
  });

  it('toPersistence round-trips', () => {
    const row = makeRow();
    const entity = AgentUpdateMapper.toDomain(row);
    const persisted = AgentUpdateMapper.toPersistence(entity);
    expect(persisted.id).toBe(row.id);
    expect(persisted.status).toBe('pending');
  });

  it('throws on invalid agent_id', () => {
    expect(() => AgentUpdateMapper.toDomain({ ...makeRow(), agent_id: 'bad' })).toThrow();
  });

  it('maps timestamp fields', () => {
    const now = new Date().toISOString();
    const row = makeRow();
    row.download_started_at = now;
    row.status = 'downloading';
    const entity = AgentUpdateMapper.toDomain(row);
    expect(entity.downloadStartedAt).toBeInstanceOf(Date);
  });
});

describe('UpdatePackageMapper', () => {
  const makeRow = () => ({
    id: crypto.randomUUID(),
    version: '5.0.3',
    platform: 'windows',
    channel: 'stable',
    checksum: 'a'.repeat(64),
    script_content: 'x'.repeat(1001),
    size: 5000,
    release_notes: 'Fix bugs',
    is_active: true,
    signature_base64: null,
    signed_at: null,
    signed_by: null,
    min_version: null,
    max_version: null,
    created_at: new Date().toISOString(),
  });

  it('toDomain maps correctly', () => {
    const pkg = UpdatePackageMapper.toDomain(makeRow());
    expect(pkg.version.normalized).toBe('5.0.3');
    expect(pkg.isActive).toBe(true);
  });

  it('toPersistence round-trips', () => {
    const row = makeRow();
    const entity = UpdatePackageMapper.toDomain(row);
    const persisted = UpdatePackageMapper.toPersistence(entity);
    expect(persisted.version).toBe('5.0.3');
    expect(persisted.is_active).toBe(true);
  });

  it('throws on invalid checksum', () => {
    expect(() => UpdatePackageMapper.toDomain({ ...makeRow(), checksum: 'bad' })).toThrow();
  });

  it('maps min/max version', () => {
    const row = { ...makeRow(), min_version: '3.0.0', max_version: '6.0.0' };
    const pkg = UpdatePackageMapper.toDomain(row);
    expect(pkg.minVersion?.normalized).toBe('3.0.0');
    expect(pkg.maxVersion?.normalized).toBe('6.0.0');
  });
});

describe('JobMapper', () => {
  const makeRow = () => ({
    id: crypto.randomUUID(),
    agent_id: crypto.randomUUID(),
    tenant_id: crypto.randomUUID(),
    type: 'run_script',
    payload: { script: 'test' },
    priority: 1,
    timeout_seconds: 300,
    status: 'pending',
    retry_count: 0,
    max_retries: 3,
    delivered_at: null,
    started_at: null,
    completed_at: null,
    result: null,
    error: null,
  });

  it('toDomain maps correctly', () => {
    const job = JobMapper.toDomain(makeRow());
    expect(job.status).toBe('pending');
    expect(job.type).toBe('run_script');
  });

  it('toPersistence round-trips', () => {
    const row = makeRow();
    const entity = JobMapper.toDomain(row);
    const persisted = JobMapper.toPersistence(entity);
    expect(persisted.id).toBe(row.id);
    expect(persisted.type).toBe('run_script');
  });

  it('handles null optional fields', () => {
    const row = { ...makeRow(), type: null, payload: null, priority: null };
    const job = JobMapper.toDomain(row);
    expect(job.type).toBe('run_script');
    expect(job.payload).toEqual({});
  });
});
