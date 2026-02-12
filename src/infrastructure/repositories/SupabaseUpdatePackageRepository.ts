import type { UpdatePackageRepository } from '@/application/ports/output/UpdatePackageRepository';
import { UpdatePackage } from '@/domain/entities/UpdatePackage';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { Platform, UpdateChannel } from '@/domain/constants';
import { UpdatePackageMapper } from '../mappers/UpdatePackageMapper';
import type { SupabaseClient } from '@supabase/supabase-js';

const TABLE = 'update_packages';

/**
 * Supabase adapter implementing the UpdatePackageRepository output port.
 */
export class SupabaseUpdatePackageRepository implements UpdatePackageRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: UpdatePackageId): Promise<UpdatePackage | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('id', id.value)
      .maybeSingle();

    if (error) throw new Error(`Failed to find package: ${error.message}`);
    if (!data) return null;

    return UpdatePackageMapper.toDomain(data);
  }

  async findLatestActive(platform: Platform, channel: UpdateChannel): Promise<UpdatePackage | null> {
    const { data, error } = await this.client
      .from(TABLE)
      .select('*')
      .eq('platform', platform)
      .eq('channel', channel)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to find latest package: ${error.message}`);
    if (!data) return null;

    return UpdatePackageMapper.toDomain(data);
  }

  async save(pkg: UpdatePackage): Promise<void> {
    const row = UpdatePackageMapper.toPersistence(pkg);
    const { error } = await this.client
      .from(TABLE)
      .upsert(row, { onConflict: 'id' });

    if (error) throw new Error(`Failed to save package: ${error.message}`);
  }
}
