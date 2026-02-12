import { UpdatePackage, type UpdatePackageProps } from '@/domain/entities/UpdatePackage';
import { AgentVersion } from '@/domain/value-objects/AgentVersion';
import { UpdateChecksum } from '@/domain/value-objects/UpdateChecksum';
import { UpdatePackageId } from '@/domain/value-objects/UpdatePackageId';
import { Platform, UpdateChannel } from '@/domain/constants';

/**
 * Maps between Supabase DB rows and UpdatePackage domain entities.
 */
export class UpdatePackageMapper {
  static toDomain(row: Record<string, any>): UpdatePackage {
    const idResult = UpdatePackageId.create(row.id);
    if (idResult.isFailure) throw new Error(`Invalid package id in DB row: ${row.id}`);
    const versionResult = AgentVersion.create(row.version);
    if (versionResult.isFailure) throw new Error(`Invalid version in DB row: ${row.version}`);
    const checksumResult = UpdateChecksum.create(row.checksum);
    if (checksumResult.isFailure) throw new Error(`Invalid checksum in DB row: ${row.checksum}`);

    const props: UpdatePackageProps = {
      id: idResult.value,
      version: versionResult.value,
      platform: row.platform as Platform,
      channel: row.channel as UpdateChannel,
      checksum: checksumResult.value,
      scriptContent: row.script_content,
      size: row.size,
      releaseNotes: row.release_notes,
      isActive: row.is_active,
      signatureBase64: row.signature_base64 ?? null,
      signedAt: row.signed_at ? new Date(row.signed_at) : null,
      signedBy: row.signed_by ?? null,
      minVersion: row.min_version ? AgentVersion.create(row.min_version).value : null,
      maxVersion: row.max_version ? AgentVersion.create(row.max_version).value : null,
      createdAt: new Date(row.created_at),
    };
    return UpdatePackage.reconstitute(props);
  }

  static toPersistence(entity: UpdatePackage): Record<string, any> {
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
