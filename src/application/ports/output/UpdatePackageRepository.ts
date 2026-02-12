import { UpdatePackage } from '@/domain/entities/UpdatePackage';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { Platform, UpdateChannel } from '@/domain/constants';

/**
 * Output port: Persistence abstraction for UpdatePackage aggregates.
 */
export interface UpdatePackageRepository {
  findById(id: UpdatePackageId): Promise<UpdatePackage | null>;

  /**
   * Find the latest active package for a given platform and channel.
   */
  findLatestActive(platform: Platform, channel: UpdateChannel): Promise<UpdatePackage | null>;

  save(pkg: UpdatePackage): Promise<void>;
}
