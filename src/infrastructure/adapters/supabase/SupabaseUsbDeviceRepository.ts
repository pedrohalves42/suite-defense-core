import { supabase } from '@/integrations/supabase/client';
import type { UsbDeviceRepository } from '@/application/ports/output/UsbDeviceRepository';
import type { UsbDevice } from '@/domain/entities/UsbDevice';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import { UsbDeviceMapper } from './mappers/UsbDeviceMapper';

export class SupabaseUsbDeviceRepository implements UsbDeviceRepository {
  async save(device: UsbDevice): Promise<void> {
    const row = UsbDeviceMapper.toPersistence(device);
    const { error } = await supabase.from('agent_usb_devices').upsert(row);
    if (error) throw new Error(`Failed to save USB device: ${error.message}`);
  }

  async findByAgent(agentId: AgentId): Promise<UsbDevice[]> {
    const { data, error } = await supabase
      .from('agent_usb_devices')
      .select('*')
      .eq('agent_id', agentId.toString())
      .order('last_seen', { ascending: false });

    if (error) throw new Error(`Failed to find USB devices: ${error.message}`);
    return (data ?? []).map(UsbDeviceMapper.toDomain);
  }

  async findBlockedByTenant(tenantId: TenantId): Promise<UsbDevice[]> {
    const { data, error } = await supabase
      .from('agent_usb_devices')
      .select('*')
      .eq('tenant_id', tenantId.toString())
      .eq('is_blocked', true);

    if (error) throw new Error(`Failed to find blocked devices: ${error.message}`);
    return (data ?? []).map(UsbDeviceMapper.toDomain);
  }

  async findByDeviceId(agentId: AgentId, deviceId: string): Promise<UsbDevice | null> {
    const { data, error } = await supabase
      .from('agent_usb_devices')
      .select('*')
      .eq('agent_id', agentId.toString())
      .eq('device_id', deviceId)
      .maybeSingle();

    if (error) throw new Error(`Failed to find USB device: ${error.message}`);
    return data ? UsbDeviceMapper.toDomain(data) : null;
  }
}
