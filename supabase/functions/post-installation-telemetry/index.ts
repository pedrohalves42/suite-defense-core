
/**
 * post-installation-telemetry - Records post-install telemetry from agents
 * 
 * MIGRATED to serveAgent middleware with hmacVerify: true
 * Auth: X-Agent-Token + HMAC signature (automated by middleware)
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const BodySchema = z.object({
  success: z.boolean().default(true),
  errors: z.unknown().optional(),
  task_created: z.boolean().optional(),
  task_running: z.boolean().optional(),
  first_heartbeat_received: z.boolean().optional(),
  scheduled_task_configured: z.boolean().optional(),
  install_path: z.string().optional(),
  install_duration_seconds: z.number().optional(),
  os_info: z.record(z.unknown()).optional(),
}).passthrough();

serveAgent(async (_req, ctx) => {
  const { agentId, agentName, tenantId, agentData, supabase, requestId, body } = ctx;
  const parsed = BodySchema.safeParse(body || {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  // `b` is the parsed payload; passthrough fields (network_tests, os_version, …) are
  // accessed via a permissive view since they are not part of the strict schema above.
  const b = parsed.data;
  const bx = parsed.data as Record<string, unknown>;
  const ad = agentData as Record<string, unknown>;
  const networkTests = (bx.network_tests as Record<string, unknown> | undefined) ?? {};

  logger.info(`[${requestId}] Telemetry data received:`, {
    agent_name: agentName,
    success: b.success,
    task_created: b.task_created,
    task_running: b.task_running,
    verified: true,
  });

  // Build telemetry record
  const telemetryData = {
    agent_id: agentId,
    tenant_id: tenantId,
    agent_name: agentName,
    event_type: 'post_installation',
    platform: 'windows',
    success: b.success ?? true,
    error_message: b.errors ? JSON.stringify(b.errors) : null,
    network_connectivity: networkTests.health_check_passed ?? null,
    dns_resolution: networkTests.dns_test ?? null,
    api_connectivity: networkTests.api_test ?? null,
    os_info: {
      type: ad.os_type ?? null,
      version: (bx.os_version as string | undefined) || (ad.os_version as string | undefined) || null,
      hostname: ad.hostname ?? null,
      powershell_version: (bx.powershell_version as string | null | undefined) ?? null,
    },
    installation_method: 'windows_ps1',
    firewall_status: (bx.firewall_status as string | undefined) || 'unknown',
    proxy_detected: (bx.proxy_detected as boolean | undefined) || false,
    metadata: {
      task_created: b.task_created ?? null,
      task_running: b.task_running ?? null,
      script_exists: (bx.script_exists as unknown) ?? null,
      script_size_bytes: (bx.script_size_bytes as unknown) ?? null,
      verified: true,
      request_id: requestId,
    },
    timestamp: (bx.installation_time as string | undefined) || new Date().toISOString(),
  } as never;

  // Insert telemetry (with idempotency check)
  const { error: insertError } = await supabase
    .from('installation_analytics')
    .insert(telemetryData);

  if (insertError) {
    // Handle duplicate key violations gracefully (idempotent)
    if (insertError.code === '23505') {
      logger.info(`[${requestId}] Duplicate telemetry detected (idempotent), returning success`);
      return {
        status: 'already_recorded',
        verified: true,
        request_id: requestId,
        message: 'Telemetry already recorded (idempotent)',
      };
    }
    logger.error(`[${requestId}] Database insert error:`, insertError);
    throw insertError;
  }

  logger.info(`[${requestId}] [OK] Telemetry inserted successfully`, {
    agent_id: agentId,
    agent_name: agentName,
    tenant_id: tenantId,
    verified: true,
  });

  // Track expected first_heartbeat after installation
  const metadata = bx.metadata as Record<string, unknown> | undefined;
  if (b.success && metadata?.installation_complete) {
    await supabase.from('installation_analytics').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      agent_name: agentName,
      event_type: 'awaiting_first_heartbeat',
      platform: 'windows',
      success: true,
      metadata: {
        installation_timestamp: new Date().toISOString(),
        expected_heartbeat_within_seconds: 120,
      },
    });
  }

  // Handle failed installations — notify admins
  if (!b.success) {
    logger.info(`[${requestId}] Installation failed, checking for admin notification`, { errors: b.errors });
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (adminRole?.user_id) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', adminRole.user_id)
        .maybeSingle();
      logger.info(`[${requestId}] Admin found for notification`, { adminEmail: adminProfile?.email });
    }
  }


  return {
    status: 'success',
    verified: true,
    request_id: requestId,
    message: 'Telemetry recorded successfully',
    agent_id: agentId,
  };
}, {
  hmacVerify: true,
  extraAgentFields: ['os_type', 'os_version', 'hostname'],
});