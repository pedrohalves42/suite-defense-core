import { UsbDevice, DeviceType } from '@/domain/entities/UsbDevice';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';
import type { UsbDeviceInsert } from '@/infrastructure/types/supabase-tables';

export class UsbDeviceMapper {
  static toDomain(row: Record<string, unknown>): UsbDevice {
    return UsbDevice.reconstitute({
      id: row.id as string,
      agentId: AgentId.create(row.agent_id as string).value,
      tenantId: TenantId.create(row.tenant_id as string).value,
      deviceId: row.device_id as string,
      vendorId: row.vendor_id as string | undefined,
      productId: row.product_id as string | undefined,
      serialNumber: row.serial_number as string | undefined,
      deviceName: row.device_name as string | undefined,
      deviceType: (row.device_type as DeviceType) ?? DeviceType.OTHER,
      isBlocked: (row.is_blocked as boolean) ?? false,
      blockReason: row.block_reason as string | undefined,
      firstSeen: new Date(row.first_seen as string),
      lastSeen: new Date(row.last_seen as string),
      collectedAt: new Date(row.collected_at as string),
      createdAt: new Date(row.created_at as string),
    });
  }

  static toPersistence(entity: UsbDevice): UsbDeviceInsert {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      device_id: entity.deviceId,
      vendor_id: entity.vendorId,
      product_id: entity.productId,
      serial_number: entity.serialNumber,
      device_name: entity.deviceName,
      device_type: entity.deviceType,
      is_blocked: entity.isBlocked,
      block_reason: entity.blockReason,
      first_seen: entity.firstSeen.toISOString(),
      last_seen: entity.lastSeen.toISOString(),
      collected_at: entity.collectedAt.toISOString(),
    };
  }
}
