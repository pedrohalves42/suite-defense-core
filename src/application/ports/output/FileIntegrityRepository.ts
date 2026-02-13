import type { FileIntegrityCheck } from '@/domain/entities/FileIntegrityCheck';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';

export interface FileIntegrityRepository {
  save(check: FileIntegrityCheck): Promise<void>;
  saveBatch(checks: FileIntegrityCheck[]): Promise<void>;
  findByAgent(agentId: AgentId): Promise<FileIntegrityCheck[]>;
  findViolationsByTenant(tenantId: TenantId): Promise<FileIntegrityCheck[]>;
}
