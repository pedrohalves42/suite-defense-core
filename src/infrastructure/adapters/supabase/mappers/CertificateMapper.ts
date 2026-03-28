import { Certificate, CertStore } from '@/domain/entities/Certificate';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

export class CertificateMapper {
  static toDomain(row: any): Certificate {
    return Certificate.reconstitute({
      id: row.id as string,
      agentId: AgentId.create(row.agent_id as string).value,
      tenantId: TenantId.create(row.tenant_id as string).value,
      certStore: (row.cert_store as CertStore) ?? CertStore.PERSONAL,
      subject: row.subject as string,
      issuer: row.issuer as string | undefined,
      thumbprint: row.thumbprint as string,
      serialNumber: row.serial_number as string | undefined,
      validFrom: row.valid_from ? new Date(row.valid_from as string) : undefined,
      validUntil: row.valid_until ? new Date(row.valid_until as string) : undefined,
      keyUsage: (row.key_usage as string[]) ?? [],
      isSelfSigned: (row.is_self_signed as boolean) ?? false,
      collectedAt: new Date(row.collected_at as string),
      createdAt: new Date(row.created_at as string),
    });
  }

  static toPersistence(entity: Certificate): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      cert_store: entity.certStore,
      subject: entity.subject,
      issuer: entity.issuer,
      thumbprint: entity.thumbprint,
      serial_number: entity.serialNumber,
      valid_from: entity.validFrom?.toISOString(),
      valid_until: entity.validUntil?.toISOString(),
      key_usage: entity.keyUsage,
      is_self_signed: entity.isSelfSigned,
      collected_at: entity.collectedAt.toISOString(),
    };
  }
}
