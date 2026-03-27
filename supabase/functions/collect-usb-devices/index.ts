/**
 * collect-usb-devices Edge Function
 * 
 * Receives USB device inventory from agents and stores in agent_usb_devices.
 * Checks devices against block policies and flags suspicious ones.
 * 
 * Migrated to serveAgent middleware (Phase 2, Step 2.4)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';

interface UsbDevicePayload {
  device_id: string;
  device_name?: string;
  device_type?: string;
  vendor_id?: string;
  product_id?: string;
  serial_number?: string;
}

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const startedAt = Date.now();

  const devices: UsbDevicePayload[] = body.usb_devices || body.devices || [];

  if (!Array.isArray(devices)) {
    return new Response(
      JSON.stringify({ error: 'usb_devices must be an array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[${requestId}] [collect-usb] Agent ${agentName}: ${devices.length} USB devices`);

  // Load block policies for this tenant
  const { data: blockPolicies } = await supabase
    .from('security_policies')
    .select('policy_data')
    .eq('tenant_id', tenantId)
    .eq('policy_type', 'usb_block')
    .eq('is_active', true);

  const blockedVendors = new Set<string>();
  const blockedDeviceTypes = new Set<string>();
  for (const policy of blockPolicies || []) {
    const data = policy.policy_data as any;
    if (data?.blocked_vendors) {
      for (const v of data.blocked_vendors) blockedVendors.add(v.toLowerCase());
    }
    if (data?.blocked_device_types) {
      for (const t of data.blocked_device_types) blockedDeviceTypes.add(t.toLowerCase());
    }
  }

  // Upsert devices and check policies
  const now = new Date().toISOString();
  let blockedCount = 0;
  let processedCount = 0;

  for (const device of devices) {
    if (!device.device_id) continue;

    const isBlocked =
      (device.vendor_id && blockedVendors.has(device.vendor_id.toLowerCase())) ||
      (device.device_type && blockedDeviceTypes.has(device.device_type.toLowerCase()));

    const blockReason = isBlocked
      ? `Policy: blocked ${device.vendor_id ? 'vendor' : 'device type'}`
      : null;

    if (isBlocked) blockedCount++;

    const { error } = await supabase
      .from('agent_usb_devices')
      .upsert(
        {
          agent_id: agentId,
          tenant_id: tenantId,
          device_id: device.device_id,
          device_name: device.device_name || null,
          device_type: device.device_type || null,
          vendor_id: device.vendor_id || null,
          product_id: device.product_id || null,
          serial_number: device.serial_number || null,
          is_blocked: isBlocked || false,
          block_reason: blockReason,
          last_seen: now,
          collected_at: now,
        },
        { onConflict: 'agent_id,device_id' }
      );

    if (error) {
      console.warn(`[${requestId}] [collect-usb] Upsert error for ${device.device_id}:`, error.message);
    } else {
      processedCount++;
    }
  }

  // Create alert if blocked devices found
  if (blockedCount > 0) {
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      alert_type: 'usb_policy_violation',
      severity: 'high',
      message: `Agent "${agentName}" detected ${blockedCount} blocked USB device(s)`,
      resolved: false,
      metadata: {
        blocked_count: blockedCount,
        total_devices: devices.length,
        detected_at: now,
      },
    });
  }

  const durationMs = Date.now() - startedAt;

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'collect-usb-devices',
      p_success: true,
      p_duration_ms: durationMs,
      p_result: { devices_processed: processedCount, blocked: blockedCount },
      p_processed_count: processedCount,
      p_job_source: 'agent',
    });
  } catch (_) { /* non-critical */ }

  console.log(`[${requestId}] [collect-usb] Done: ${processedCount} processed, ${blockedCount} blocked in ${durationMs}ms`);

  return {
    success: true,
    devices_processed: processedCount,
    blocked_count: blockedCount,
    total_received: devices.length,
  };
});
