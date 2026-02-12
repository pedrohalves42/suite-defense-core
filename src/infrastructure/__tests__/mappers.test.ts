import { describe, it, expect } from 'vitest';
import { UpdatePackageMapper } from '@/infrastructure/mappers/UpdatePackageMapper';
import { AgentUpdateMapper } from '@/infrastructure/mappers/AgentUpdateMapper';
import { UpdatePackage } from '@/domain/entities/UpdatePackage';
import { AgentUpdate } from '@/domain/entities/AgentUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { AgentVersion } from '@/domain/value-objects/AgentVersion';
import { UpdateChecksum } from '@/domain/value-objects/UpdateChecksum';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { Platform, UpdateChannel, UpdateStatus } from '@/domain/constants';

const sha = 'a'.repeat(64);
const validScript = 'x'.repeat(1001);

describe('UpdatePackageMapper', () => {
  const sampleRow = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    version: '5.0.3',
    platform: 'windows',
    channel: 'stable',
    checksum: sha,
    script_content: validScript,
    size: validScript.length,
    release_notes: 'Fix critical bug',
    is_active: true,
    signature_base64: null,
    signed_at: null,
    signed_by: null,
    min_version: '4.0.0',
    max_version: null,
    created_at: '2026-01-15T10:00:00Z',
  };

  it('maps DB row to domain entity', () => {
    const entity = UpdatePackageMapper.toDomain(sampleRow);
    expect(entity.version.normalized).toBe('5.0.3');
    expect(entity.platform).toBe(Platform.WINDOWS);
    expect(entity.channel).toBe(UpdateChannel.STABLE);
    expect(entity.checksum.value).toBe(sha);
    expect(entity.isActive).toBe(true);
    expect(entity.isCompatibleWith(AgentVersion.create('3.0.0').value)).toBe(false);
    expect(entity.isCompatibleWith(AgentVersion.create('4.5.0').value)).toBe(true);
  });

  it('maps domain entity to persistence row', () => {
    const entity = UpdatePackage.create({
      id: UpdatePackageId.create('550e8400-e29b-41d4-a716-446655440000').value,
      version: AgentVersion.create('5.0.3').value,
      platform: Platform.WINDOWS,
      channel: UpdateChannel.STABLE,
      checksum: UpdateChecksum.create(sha).value,
      scriptContent: validScript,
      size: validScript.length,
      releaseNotes: 'test',
      isActive: true,
      createdAt: new Date('2026-01-15T10:00:00Z'),
    });

    const row = UpdatePackageMapper.toPersistence(entity);
    expect(row.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(row.version).toBe('5.0.3');
    expect(row.platform).toBe('windows');
    expect(row.is_active).toBe(true);
    expect(row.script_content).toBe(validScript);
  });

  it('roundtrips correctly', () => {
    const entity = UpdatePackageMapper.toDomain(sampleRow);
    const row = UpdatePackageMapper.toPersistence(entity);
    const entity2 = UpdatePackageMapper.toDomain({ ...sampleRow, ...row });
    expect(entity2.version.normalized).toBe(entity.version.normalized);
    expect(entity2.checksum.value).toBe(entity.checksum.value);
  });
});

describe('AgentUpdateMapper', () => {
  const agentId = '550e8400-e29b-41d4-a716-446655440000';
  const packageId = '660e8400-e29b-41d4-a716-446655440000';

  const sampleRow = {
    id: '770e8400-e29b-41d4-a716-446655440000',
    agent_id: agentId,
    package_id: packageId,
    status: 'downloading',
    download_started_at: '2026-01-15T10:00:00Z',
    download_completed_at: null,
    apply_started_at: null,
    apply_completed_at: null,
    error_message: null,
    rollback_reason: null,
    created_at: '2026-01-15T09:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  };

  it('maps DB row to domain entity', () => {
    const entity = AgentUpdateMapper.toDomain(sampleRow);
    expect(entity.id).toBe('770e8400-e29b-41d4-a716-446655440000');
    expect(entity.agentId.value).toBe(agentId);
    expect(entity.packageId.value).toBe(packageId);
    expect(entity.status).toBe(UpdateStatus.DOWNLOADING);
  });

  it('maps domain entity to persistence row', () => {
    const entity = AgentUpdate.create(
      AgentId.create(agentId).value,
      UpdatePackageId.create(packageId).value
    );
    const row = AgentUpdateMapper.toPersistence(entity);
    expect(row.agent_id).toBe(agentId);
    expect(row.package_id).toBe(packageId);
    expect(row.status).toBe('pending');
  });

  it('preserves error message through mapping', () => {
    const rowWithError = { ...sampleRow, status: 'failed', error_message: 'disk full' };
    const entity = AgentUpdateMapper.toDomain(rowWithError);
    expect(entity.errorMessage).toBe('disk full');
  });
});
