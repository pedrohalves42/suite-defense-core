import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckForUpdate } from '@/application/use-cases/CheckForUpdate';
import { ScheduleUpdate } from '@/application/use-cases/ScheduleUpdate';
import { ProcessUpdateStatus } from '@/application/use-cases/ProcessUpdateStatus';
import { RollbackUpdate } from '@/application/use-cases/RollbackUpdate';
import { UpdatePackage } from '@/domain/entities/UpdatePackage';
import { AgentUpdate } from '@/domain/entities/AgentUpdate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { AgentVersion } from '@/domain/value-objects/AgentVersion';
import { UpdateChecksum } from '@/domain/value-objects/UpdateChecksum';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { Platform, UpdateChannel, UpdateStatus } from '@/domain/constants';
import type { UpdatePackageRepository } from '@/application/ports/output/UpdatePackageRepository';
import type { AgentUpdateRepository } from '@/application/ports/output/AgentUpdateRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';

const sha = 'a'.repeat(64);
const shaB = 'b'.repeat(64);
const validScript = 'x'.repeat(1001);

function mockEventDispatcher(): DomainEventDispatcher {
  return { dispatch: vi.fn(), dispatchAll: vi.fn() };
}

function mockPackageRepo(overrides: Partial<UpdatePackageRepository> = {}): UpdatePackageRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findLatestActive: vi.fn().mockResolvedValue(null),
    save: vi.fn(),
    ...overrides,
  };
}

function mockUpdateRepo(overrides: Partial<AgentUpdateRepository> = {}): AgentUpdateRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findActiveByAgentId: vi.fn().mockResolvedValue(null),
    save: vi.fn(),
    ...overrides,
  };
}

function makePackage(version = '5.0.3', checksum = sha) {
  return UpdatePackage.create({
    id: UpdatePackageId.generate(),
    version: AgentVersion.create(version).value,
    platform: Platform.WINDOWS,
    channel: UpdateChannel.STABLE,
    checksum: UpdateChecksum.create(checksum).value,
    scriptContent: validScript,
    size: validScript.length,
    releaseNotes: 'test release',
    isActive: true,
    createdAt: new Date(),
  });
}

describe('CheckForUpdate', () => {
  const agentId = AgentId.generate();
  const currentVersion = AgentVersion.create('4.0.0').value;
  const currentChecksum = UpdateChecksum.create(sha).value;

  it('returns update when newer version available', async () => {
    const pkg = makePackage('5.0.3');
    const repo = mockPackageRepo({ findLatestActive: vi.fn().mockResolvedValue(pkg) });
    const dispatcher = mockEventDispatcher();
    const uc = new CheckForUpdate(repo, dispatcher);

    const result = await uc.execute({
      agentId, currentVersion, currentChecksum,
      platform: Platform.WINDOWS, channel: UpdateChannel.STABLE,
    });

    expect(result).not.toBeNull();
    expect(result!.version).toBe('5.0.3');
    expect(result!.isHotfix).toBe(false);
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('returns null when already up to date', async () => {
    const pkg = makePackage('4.0.0', sha);
    const repo = mockPackageRepo({ findLatestActive: vi.fn().mockResolvedValue(pkg) });
    const uc = new CheckForUpdate(repo, mockEventDispatcher());

    const result = await uc.execute({
      agentId, currentVersion: AgentVersion.create('4.0.0').value,
      currentChecksum: UpdateChecksum.create(sha).value,
      platform: Platform.WINDOWS, channel: UpdateChannel.STABLE,
    });

    expect(result).toBeNull();
  });

  it('detects hotfix (same version, different checksum)', async () => {
    const pkg = makePackage('4.0.0', shaB);
    const repo = mockPackageRepo({ findLatestActive: vi.fn().mockResolvedValue(pkg) });
    const dispatcher = mockEventDispatcher();
    const uc = new CheckForUpdate(repo, dispatcher);

    const result = await uc.execute({
      agentId,
      currentVersion: AgentVersion.create('4.0.0').value,
      currentChecksum: UpdateChecksum.create(sha).value,
      platform: Platform.WINDOWS, channel: UpdateChannel.STABLE,
    });

    expect(result).not.toBeNull();
    expect(result!.isHotfix).toBe(true);
  });

  it('returns null when no package exists', async () => {
    const uc = new CheckForUpdate(mockPackageRepo(), mockEventDispatcher());
    const result = await uc.execute({
      agentId, currentVersion, currentChecksum,
      platform: Platform.WINDOWS, channel: UpdateChannel.STABLE,
    });
    expect(result).toBeNull();
  });
});

describe('ScheduleUpdate', () => {
  it('creates a new agent update', async () => {
    const pkg = makePackage();
    const pkgRepo = mockPackageRepo({ findById: vi.fn().mockResolvedValue(pkg) });
    const updateRepo = mockUpdateRepo();
    const dispatcher = mockEventDispatcher();
    const uc = new ScheduleUpdate(pkgRepo, updateRepo, dispatcher);

    const result = await uc.execute({
      agentId: AgentId.generate(),
      packageId: pkg.id,
    });

    expect(result.status).toBe(UpdateStatus.PENDING);
    expect(updateRepo.save).toHaveBeenCalled();
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('rejects if agent already has active update', async () => {
    const agentId = AgentId.generate();
    const existing = AgentUpdate.create(agentId, UpdatePackageId.generate());
    const updateRepo = mockUpdateRepo({ findActiveByAgentId: vi.fn().mockResolvedValue(existing) });
    const uc = new ScheduleUpdate(mockPackageRepo(), updateRepo, mockEventDispatcher());

    await expect(uc.execute({ agentId, packageId: UpdatePackageId.generate() }))
      .rejects.toThrow('already has an active update');
  });

  it('rejects if package not found', async () => {
    const uc = new ScheduleUpdate(mockPackageRepo(), mockUpdateRepo(), mockEventDispatcher());
    await expect(uc.execute({ agentId: AgentId.generate(), packageId: UpdatePackageId.generate() }))
      .rejects.toThrow('not found');
  });

  it('rejects if package is inactive', async () => {
    const pkg = makePackage();
    pkg.deactivate();
    const pkgRepo = mockPackageRepo({ findById: vi.fn().mockResolvedValue(pkg) });
    const uc = new ScheduleUpdate(pkgRepo, mockUpdateRepo(), mockEventDispatcher());

    await expect(uc.execute({ agentId: AgentId.generate(), packageId: pkg.id }))
      .rejects.toThrow('not active');
  });
});

describe('ProcessUpdateStatus', () => {
  function makeActiveUpdate() {
    return AgentUpdate.create(AgentId.generate(), UpdatePackageId.generate());
  }

  it('transitions to downloading', async () => {
    const update = makeActiveUpdate();
    const repo = mockUpdateRepo({ findById: vi.fn().mockResolvedValue(update) });
    const dispatcher = mockEventDispatcher();
    const uc = new ProcessUpdateStatus(repo, dispatcher);

    const result = await uc.execute({ updateId: update.id, newStatus: 'downloading' });

    expect(result.previousStatus).toBe(UpdateStatus.PENDING);
    expect(result.currentStatus).toBe(UpdateStatus.DOWNLOADING);
    expect(repo.save).toHaveBeenCalled();
  });

  it('transitions to failed with error message', async () => {
    const update = makeActiveUpdate();
    const repo = mockUpdateRepo({ findById: vi.fn().mockResolvedValue(update) });
    const dispatcher = mockEventDispatcher();
    const uc = new ProcessUpdateStatus(repo, dispatcher);

    const result = await uc.execute({
      updateId: update.id, newStatus: 'failed', errorMessage: 'disk full',
    });

    expect(result.currentStatus).toBe(UpdateStatus.FAILED);
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('rejects if update not found', async () => {
    const uc = new ProcessUpdateStatus(mockUpdateRepo(), mockEventDispatcher());
    await expect(uc.execute({ updateId: 'nope', newStatus: 'downloading' }))
      .rejects.toThrow('not found');
  });
});

describe('RollbackUpdate', () => {
  it('rolls back a completed update', async () => {
    const update = AgentUpdate.create(AgentId.generate(), UpdatePackageId.generate());
    update.startDownload();
    update.completeDownload();
    update.startApply();
    update.complete();

    const repo = mockUpdateRepo({ findById: vi.fn().mockResolvedValue(update) });
    const dispatcher = mockEventDispatcher();
    const uc = new RollbackUpdate(repo, dispatcher);

    const result = await uc.execute({ updateId: update.id, reason: 'regression' });

    expect(result.rolledBackFromStatus).toBe(UpdateStatus.COMPLETED);
    expect(repo.save).toHaveBeenCalled();
    expect(dispatcher.dispatch).toHaveBeenCalled();
  });

  it('rejects if update not found', async () => {
    const uc = new RollbackUpdate(mockUpdateRepo(), mockEventDispatcher());
    await expect(uc.execute({ updateId: 'nope', reason: 'test' }))
      .rejects.toThrow('not found');
  });
});
