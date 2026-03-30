/**
 * Telemetry & hash persistence for serve-installer
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

/**
 * Calculates SHA256 hash and persists installer metadata
 */
export async function persistInstallerHash(
  supabaseClient: SupabaseClient,
  templateContent: string,
  enrollmentKey: string,
  requestId: string,
): Promise<{ sha256: string; sizeBytes: number }> {
  const installerData = new TextEncoder().encode(templateContent);
  const hashBuffer = await crypto.subtle.digest('SHA-256', installerData);
  const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  const sizeBytes = installerData.length;

  logger.info(`[${requestId}] Installer SHA256: ${sha256}, Size: ${sizeBytes} bytes`);

  try {
    const { error: updateError } = await supabaseClient
      .from('enrollment_keys')
      .update({
        installer_sha256: sha256,
        installer_size_bytes: sizeBytes,
        installer_generated_at: new Date().toISOString(),
      })
      .eq('key', enrollmentKey);

    if (updateError) {
      logger.error(`[${requestId}] Failed to persist installer hash:`, updateError);
    } else {
      logger.debug(`[${requestId}] Installer hash persisted to database`);
    }
  } catch (dbError) {
    logger.error(`[${requestId}] Database error persisting hash:`, dbError);
  }

  return { sha256, sizeBytes };
}

/**
 * Tracks download event in installation_analytics
 */
export async function trackDownloadEvent(
  supabaseClient: SupabaseClient,
  tenantId: string,
  agentId: string,
  agentName: string,
  platform: string,
  sha256: string,
  sizeBytes: number,
  req: Request,
  requestId: string,
): Promise<void> {
  try {
    const { error: telemetryError } = await supabaseClient
      .from('installation_analytics')
      .insert({
        tenant_id: tenantId,
        agent_id: agentId,
        agent_name: agentName,
        event_type: 'downloaded',
        platform,
        installation_method: 'one_click',
        success: true,
        ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
        metadata: {
          installer_version: (await import('../_shared/installer-version.ts')).INSTALLER_VERSION,
          installer_size_bytes: sizeBytes,
          installer_sha256: sha256.substring(0, 16) + '...',
        },
      });

    if (telemetryError) {
      logger.warn(`[${requestId}] Failed to track downloaded event:`, telemetryError);
    } else {
      logger.debug(`[${requestId}] Tracked 'downloaded' event for ${agentName}`);
    }
  } catch (telemetryErr) {
    logger.warn(`[${requestId}] Telemetry error:`, telemetryErr);
  }
}
