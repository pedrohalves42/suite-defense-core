/**
 * Handler: USB devices collection
 * Extracted from collect-usb-devices/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

interface UsbDevicePayload {
  device_id: string;
  device_name?: string;
  device_type?: string;
  vendor_id?: string;
  product_id?: string;
  serial_number?: string;
}

export async function handleUsbDevices(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const startedAt = Date.now();
  const devices: UsbDevicePayload[] = (body.usb_devices || body.devices || []) as UsbDevicePayload[];

  if (!Array.isArray(devices)) {
    return new Response(
      JSON.stringify({ error: 'usb_devices must be an array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  logger.info(`[${requestId}] [collect-usb] Agent ${agentName}: ${devices.length} USB devices`);

  const { data: blockPolicies } = await supabase
    .from('security_policies').select('policy_data')
    .eq('tenant_id', tenantId).eq('policy_type', 'usb_block').eq('is_active', true);

  const blockedVendors = new Set<string>();
  const blockedDeviceTypes = new Set<string>();
  for (const policy of blockPolicies || []) {
    const data = policy.policy_data as Record<string, unknown>;
    if (data?.blocked_vendors) for (const v of data.blocked_vendors as string[]) blockedVendors.add(v.toLowerCase());
    if (data?.blocked_device_types) for (const t of data.blocked_device_types as string[]) blockedDeviceTypes.add(t.toLowerCase());
  }

  const now = new Date().toISOString();
  let blockedCount = 0;
  let processedCount = 0;

  for (const device of devices) {
    if (!device.device_id) continue;
    const isBlocked = (device.vendor_id && blockedVendors.has(device.vendor_id.toLowerCase())) ||
      (device.device_type && blockedDeviceTypes.has(device.device_type.toLowerCase()));
    if (isBlocked) blockedCount++;

    const { error } = await supabase.from('agent_usb_devices').upsert({
      agent_id: agentId, tenant_id: tenantId, device_id: device.device_id,
      device_name: device.device_name || null, device_type: device.device_type || null,
      vendor_id: device.vendor_id || null, product_id: device.product_id || null,
      serial_number: device.serial_number || null, is_blocked: isBlocked || false,
      block_reason: isBlocked ? `Policy: blocked ${device.vendor_id ? 'vendor' : 'device type'}` : null,
      last_seen: now, collected_at: now,
    }, { onConflict: 'agent_id,device_id' });

    if (error) logger.warn(`[${requestId}] [collect-usb] Upsert error for ${device.device_id}:`, error.message);
    else processedCount++;
  }

  if (blockedCount > 0) {
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId, agent_id: agentId, alert_type: 'usb_policy_violation',
      severity: 'high', message: `Agent "${agentName}" detected ${blockedCount} blocked USB device(s)`,
      resolved: false, metadata: { blocked_count: blockedCount, total_devices: devices.length, detected_at: now },
    });
  }

  const durationMs = Date.now() - startedAt;
  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'collect-usb-devices', p_success: true, p_duration_ms: durationMs,
      p_result: { devices_processed: processedCount, blocked: blockedCount },
      p_processed_count: processedCount, p_job_source: 'agent',
    });
  } catch (_) { /* non-critical */ }

  return { success: true, devices_processed: processedCount, blocked_count: blockedCount, total_received: devices.length };
}
