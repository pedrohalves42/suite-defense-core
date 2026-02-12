import type { CheckForUpdateUseCase, CheckForUpdateCommand, UpdateAvailableResult } from '../ports/input/CheckForUpdateUseCase';
import type { UpdatePackageRepository } from '../ports/output/UpdatePackageRepository';
import type { DomainEventDispatcher } from '../ports/output/DomainEventDispatcher';
import { UpdateAvailableEvent } from '@/domain/events/UpdateEvents';

export class CheckForUpdate implements CheckForUpdateUseCase {
  constructor(
    private readonly packageRepo: UpdatePackageRepository,
    private readonly eventDispatcher: DomainEventDispatcher
  ) {}

  async execute(command: CheckForUpdateCommand): Promise<UpdateAvailableResult | null> {
    const latestPackage = await this.packageRepo.findLatestActive(
      command.platform,
      command.channel
    );

    if (!latestPackage) return null;

    if (!latestPackage.isCompatibleWith(command.currentVersion)) return null;

    const isUpgrade = latestPackage.isUpgradeFor(command.currentVersion);
    const isHotfix = latestPackage.isHotfixFor(command.currentVersion, command.currentChecksum);

    if (!isUpgrade && !isHotfix) return null;

    await this.eventDispatcher.dispatch(
      new UpdateAvailableEvent(
        command.agentId.value,
        latestPackage.version.normalized,
        command.platform
      )
    );

    return {
      packageId: latestPackage.id.value,
      version: latestPackage.version.normalized,
      checksum: latestPackage.checksum.value,
      size: latestPackage.size,
      releaseNotes: latestPackage.releaseNotes,
      isHotfix,
    };
  }
}
