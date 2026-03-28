import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckForUpdate } from '../use-cases/CheckForUpdate';
import { AgentVersion } from '@/domain/value-objects/AgentVersion';
import { UpdateChecksum } from '@/domain/value-objects/UpdateChecksum';
import { AgentId } from '@/domain/value-objects/AgentId';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { Platform, UpdateChannel } from '@/domain/constants';
import type { UpdatePackageRepository } from '../ports/output/UpdatePackageRepository';
import type { DomainEventDispatcher } from '../ports/output/DomainEventDispatcher';

const CHECKSUM_A = 'a'.repeat(64);
const CHECKSUM_B = 'b'.repeat(64);

function makeMockPackage(overrides: any = {}) {
  return {
    id: UpdatePackageId.generate(),
    version: AgentVersion.create('5.1.0').value,
    checksum: UpdateChecksum.create(CHECKSUM_A).value,
    size: 5000,
    releaseNotes: 'Bug fixes',
    isActive: true,
    isCompatibleWith: vi.fn().mockReturnValue(true),
    isUpgradeFor: vi.fn().mockReturnValue(true),
    isHotfixFor: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

describe('CheckForUpdate Use Case', () => {
  let packageRepo: UpdatePackageRepository;
  let eventDispatcher: DomainEventDispatcher;
  let useCase: CheckForUpdate;

  beforeEach(() => {
    packageRepo = {
      findLatestActive: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
    };
    eventDispatcher = {
      dispatch: vi.fn(),
      dispatchAll: vi.fn(),
    };
    useCase = new CheckForUpdate(packageRepo, eventDispatcher);
  });

  it('returns null when no package found', async () => {
    vi.mocked(packageRepo.findLatestActive).mockResolvedValue(null);

    const result = await useCase.execute({
      agentId: AgentId.generate(),
      currentVersion: AgentVersion.create('5.0.0').value,
      currentChecksum: UpdateChecksum.create(CHECKSUM_A).value,
      platform: Platform.WINDOWS,
      channel: UpdateChannel.STABLE,
    });

    expect(result).toBeNull();
  });

  it('returns null when not compatible', async () => {
    const pkg = makeMockPackage({ isCompatibleWith: vi.fn().mockReturnValue(false) });
    vi.mocked(packageRepo.findLatestActive).mockResolvedValue(pkg as any);

    const result = await useCase.execute({
      agentId: AgentId.generate(),
      currentVersion: AgentVersion.create('5.0.0').value,
      currentChecksum: UpdateChecksum.create(CHECKSUM_A).value,
      platform: Platform.WINDOWS,
      channel: UpdateChannel.STABLE,
    });

    expect(result).toBeNull();
  });

  it('returns update when upgrade available', async () => {
    const pkg = makeMockPackage();
    vi.mocked(packageRepo.findLatestActive).mockResolvedValue(pkg as any);

    const result = await useCase.execute({
      agentId: AgentId.generate(),
      currentVersion: AgentVersion.create('5.0.0').value,
      currentChecksum: UpdateChecksum.create(CHECKSUM_A).value,
      platform: Platform.WINDOWS,
      channel: UpdateChannel.STABLE,
    });

    expect(result).not.toBeNull();
    expect(result!.version).toBe('5.1.0');
    expect(result!.isHotfix).toBe(false);
    expect(eventDispatcher.dispatch).toHaveBeenCalledOnce();
  });

  it('returns hotfix when same version different checksum', async () => {
    const pkg = makeMockPackage({
      isUpgradeFor: vi.fn().mockReturnValue(false),
      isHotfixFor: vi.fn().mockReturnValue(true),
    });
    vi.mocked(packageRepo.findLatestActive).mockResolvedValue(pkg as any);

    const result = await useCase.execute({
      agentId: AgentId.generate(),
      currentVersion: AgentVersion.create('5.1.0').value,
      currentChecksum: UpdateChecksum.create(CHECKSUM_B).value,
      platform: Platform.WINDOWS,
      channel: UpdateChannel.STABLE,
    });

    expect(result).not.toBeNull();
    expect(result!.isHotfix).toBe(true);
  });

  it('returns null when no upgrade and no hotfix', async () => {
    const pkg = makeMockPackage({
      isUpgradeFor: vi.fn().mockReturnValue(false),
      isHotfixFor: vi.fn().mockReturnValue(false),
    });
    vi.mocked(packageRepo.findLatestActive).mockResolvedValue(pkg as any);

    const result = await useCase.execute({
      agentId: AgentId.generate(),
      currentVersion: AgentVersion.create('5.1.0').value,
      currentChecksum: UpdateChecksum.create(CHECKSUM_A).value,
      platform: Platform.WINDOWS,
      channel: UpdateChannel.STABLE,
    });

    expect(result).toBeNull();
  });
});
