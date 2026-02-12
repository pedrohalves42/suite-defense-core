import type { UpdatePackageRepository } from '@/application/ports/output/UpdatePackageRepository';
import type { UpdatePackage } from '@/domain/entities/UpdatePackage';
import type { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import type { Platform, UpdateChannel } from '@/domain/constants';
import { UpdatePackageMapper } from '@/infrastructure/mappers/UpdatePackageMapper';
import { supabase } from '@/integrations/supabase/client';

/**
 * Supabase adapter for UpdatePackageRepository port.
 */
export class SupabaseUpdatePackageRepository implements UpdatePackageRepository {
  async findById(id: UpdatePackageId): Promise<UpdatePackage | null> {
    const { data, error } = await supabase
      .from('update_packages')
      .select('*')
      .eq('id', id.value)
      .maybeSingle();

    if (error || !data) return null;
    return UpdatePackageMapper.toDomain(data);
  }

  async findLatestActive(platform: Platform, channel: UpdateChannel): Promise<UpdatePackage | null> {
    const { data, error } = await supabase
      .from('update_packages')
      .select('*')
      .eq('platform', platform)
      .eq('channel', channel)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return UpdatePackageMapper.toDomain(data);
  }

  async save(pkg: UpdatePackage): Promise<void> {
    const persistence = UpdatePackageMapper.toPersistence(pkg);
    const { error } = await supabase
      .from('update_packages')
      .upsert(persistence as any);

    if (error) {
      throw new Error(`Failed to save update package: ${error.message}`);
    }
  }
}
