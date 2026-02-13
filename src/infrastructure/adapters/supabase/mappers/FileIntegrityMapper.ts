import { FileIntegrityCheck, IntegrityStatus, type ScanType, type FileIntegritySeverity } from '@/domain/entities/FileIntegrityCheck';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

export class FileIntegrityMapper {
  static toDomain(row: Record<string, unknown>): FileIntegrityCheck {
    return FileIntegrityCheck.reconstitute({
      id: row.id as string,
      agentId: AgentId.create(row.agent_id as string).value,
      tenantId: TenantId.create(row.tenant_id as string).value,
      filePath: row.file_path as string,
      expectedHash: (row.expected_hash as string) ?? null,
      actualHash: row.actual_hash as string,
      status: (row.integrity_status as IntegrityStatus) ?? IntegrityStatus.UNKNOWN,
      scanType: row.scan_type as ScanType,
      severity: row.severity as FileIntegritySeverity,
      fileSize: row.file_size as number | undefined,
      modifiedAt: row.modified_at ? new Date(row.modified_at as string) : undefined,
      collectedAt: new Date(row.collected_at as string),
      createdAt: new Date(row.created_at as string),
    });
  }

  static toPersistence(entity: FileIntegrityCheck): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      file_path: entity.filePath,
      expected_hash: entity.expectedHash,
      actual_hash: entity.actualHash,
      integrity_status: entity.status,
      scan_type: entity.scanType,
      severity: entity.severity,
      file_size: entity.fileSize,
      modified_at: entity.modifiedAt?.toISOString(),
      collected_at: entity.collectedAt.toISOString(),
    };
  }
}
