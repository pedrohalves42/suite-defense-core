import { UpdatePackage, type UpdatePackageProps } from '@/domain/entities/UpdatePackage';
import { AgentVersion } from '@/domain/value-objects/AgentVersion';
import { UpdateChecksum } from '@/domain/value-objects/UpdateChecksum';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { Platform, UpdateChannel } from '@/domain/constants';
import type { UpdatePackageInsert } from '@/infrastructure/types/supabase-tables';

/**
 * Maps between Supabase DB rows and UpdatePackage domain entities.
 */
export class UpdatePackageMapper {
  static toDomain(row: Record<string, unknown>): UpdatePackage {
    const idResult = UpdatePackageId.create(row.id as string);
    if (idResult.isFailure) throw new Error(`Invalid package id in DB row: ${row.id}`);
    const versionResult = AgentVersion.create(row.version as string);
    if (versionResult.isFailure) throw new Error(`Invalid version in DB row: ${row.version}`);
    const checksumResult = UpdateChecksum.create(row.checksum as string);
    if (checksumResult.isFailure) throw new Error(`Invalid checksum in DB row: ${row.checksum}`);

    const props: UpdatePackageProps = {
      id: idResult.value,
      version: versionResult.value,
      platform: row.platform as Platform,
      channel: row.channel as UpdateChannel,
      checksum: checksumResult.value,
      scriptContent: row.script_content as string,
      size: row.size as number,
      releaseNotes: row.release_notes as string,
      isActive: row.is_active as boolean,
      signatureBase64: (row.signature_base64 as string) ?? null,
      signedAt: row.signed_at ? new Date(row.signed_at as string) : null,
      signedBy: (row.signed_by as string) ?? null,
      minVersion: row.min_version ? AgentVersion.create(row.min_version as string).value : null,
      maxVersion: row.max_version ? AgentVersion.create(row.max_version as string).value : null,
      createdAt: new Date(row.created_at as string),
    };
    return UpdatePackage.reconstitute(props);
  }

  static toPersistence(entity: UpdatePackage): UpdatePackageInsert {
    return {
      id: entity.id.value,
      version: entity.version.normalized,
      platform: entity.platform,
      channel: entity.channel,
      checksum: entity.checksum.value,
      script_content: entity.scriptContent,
      size: entity.size,
      release_notes: entity.releaseNotes,
      is_active: entity.isActive,
      signature_base64: entity.signatureBase64 ?? null,
      signed_at: entity.signedAt?.toISOString() ?? null,
      signed_by: entity.signedBy ?? null,
      min_version: entity.minVersion?.normalized ?? null,
      max_version: entity.maxVersion?.normalized ?? null,
      created_at: entity.createdAt.toISOString(),
    };
  }
}
