import type { Certificate } from '@/domain/entities/Certificate';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';

export interface CertificateRepository {
  save(cert: Certificate): Promise<void>;
  saveBatch(certs: Certificate[]): Promise<void>;
  findByAgent(agentId: AgentId): Promise<Certificate[]>;
  findExpiringByTenant(tenantId: TenantId, withinDays: number): Promise<Certificate[]>;
}
