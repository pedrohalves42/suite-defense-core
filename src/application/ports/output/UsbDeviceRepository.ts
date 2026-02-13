import type { UsbDevice } from '@/domain/entities/UsbDevice';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';

export interface UsbDeviceRepository {
  save(device: UsbDevice): Promise<void>;
  findByAgent(agentId: AgentId): Promise<UsbDevice[]>;
  findBlockedByTenant(tenantId: TenantId): Promise<UsbDevice[]>;
  findByDeviceId(agentId: AgentId, deviceId: string): Promise<UsbDevice | null>;
}
