/**
 * Hexagonal Use Case: Process Heartbeat
 * 
 * Deno-compatible thin handler for the heartbeat domain logic.
 * Encapsulates agent status update, metrics persistence, and force-update detection.
 */

import { logger } from '../../logger.ts';
import { normalizeVersion, normalizeForWindows } from '../update-decision-service.ts';

export interface HeartbeatCommand {
  agentId: string;
  agentName: string;
  tenantId: string;
  osType?: string;
  osVersion?: string;
  hostname?: string;
  agentVersion?: string;
  ed25519Supported?: boolean;
  signatureMode?: string;
  systemMetrics?: Record<string, unknown> | null;
}

export interface ForceUpdatePayload {
  forceUpdate: true;
  targetVersion: string;
  scriptContentBase64: string;
  sha256: string;
  reason: string;
  overrideSafeMode: boolean;
}

export interface HeartbeatResult {
  ok: true;
  agentName: string;
  timestamp: string;
  forceUpdate?: ForceUpdatePayload;
}

interface SupabaseClient {
  from(table: string): ReturnType<SupabaseClient['from']>;
  rpc(fn: string, params: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}

/**
 * Processes a heartbeat from an agent.
 * Pure use case logic ? authentication is handled by the Edge Function handler.
 */
export class ProcessHeartbeatUseCase {
  constructor(private readonly supabase: SupabaseClient) {}

  async execute(command: HeartbeatCommand): Promise<HeartbeatResult> {
    const now = new Date().toISOString();

    // 1. Update agent status
    const updateData: Record<string, unknown> = {
      last_heartbeat: now,
      status: 'active',
    };

    if (command.osType) updateData.os_type = command.osType;
    if (command.osVersion) updateData.os_version = command.osVersion;
    if (command.hostname) updateData.hostname = command.hostname;
    if (command.agentVersion) updateData.agent_version = command.agentVersion;
    if (command.ed25519Supported !== undefined) updateData.ed25519_supported = command.ed25519Supported;
    if (command.signatureMode) updateData.signature_mode = command.signatureMode;

    const { error: updateError } = await this.supabase
      .from('agents')
      .update(updateData)
      .eq('id', command.agentId);

    if (updateError) {
      logger.error('[ProcessHeartbeat] Failed to update agent', {
        agentName: command.agentName,
        error: updateError.message,
      });
    }

    // 2. Persist system metrics if present
    if (command.systemMetrics && typeof command.systemMetrics === 'object' && !((command.systemMetrics as Record<string, unknown>).error)) {
      await this.persistMetrics(command.agentId, command.tenantId, command.systemMetrics);
    }

    // 3. Check for force update
    const forceUpdate = await this.checkForceUpdate(command);

    const result: HeartbeatResult = {
      ok: true,
      agentName: command.agentName,
      timestamp: now,
    };

    if (forceUpdate) {
      result.forceUpdate = forceUpdate;
    }

    return result;
  }

  private async persistMetrics(
    agentId: string,
    tenantId: string,
    metrics: Record<string, unknown>
  ): Promise<void> {
    const metricsRow = {
      agent_id: agentId,
      tenant_id: tenantId,
      cpu_usage_percent: (metrics.cpu_percent as number) ?? null,
      cpu_name: (metrics.cpu_name as string) ?? null,
      cpu_cores: (metrics.cpu_cores as number) ?? null,
      memory_total_gb: (metrics.memory_total_gb as number) ?? null,
      memory_used_gb: (metrics.memory_used_gb as number) ?? null,
      memory_free_gb: (metrics.memory_free_gb as number) ??
        (metrics.memory_total_gb != null && metrics.memory_used_gb != null
          ? Math.round(((metrics.memory_total_gb as number) - (metrics.memory_used_gb as number)) * 100) / 100
          : null),
      memory_usage_percent: (metrics.memory_used_percent as number) ?? null,
      disk_total_gb: (metrics.disk_total_gb as number) ?? null,
      disk_used_gb: metrics.disk_total_gb != null && metrics.disk_free_gb != null
        ? Math.round(((metrics.disk_total_gb as number) - (metrics.disk_free_gb as number)) * 100) / 100
        : null,
      disk_free_gb: (metrics.disk_free_gb as number) ?? null,
      disk_usage_percent: (metrics.disk_used_percent as number) ?? null,
      uptime_seconds: (metrics.uptime_seconds as number) ?? null,
      collected_at: new Date().toISOString(),
    };

    const { error } = await this.supabase
      .from('agent_system_metrics')
      .insert(metricsRow);

    if (error) {
      logger.error('[ProcessHeartbeat] Metrics insert failed', {
        agentId,
        error: error.message,
      });
    }
  }

  private async checkForceUpdate(command: HeartbeatCommand): Promise<ForceUpdatePayload | null> {
    const { data: forceCheck } = await this.supabase
      .from('agents')
      .select('force_update_version, force_update_reason, force_update_override_safe_mode, force_update_override_safe_mode_expires_at, force_update_delivered_count, force_update_first_delivered_at')
      .eq('id', command.agentId)
      .single();

    if (!forceCheck?.force_update_version) return null;

    // Check if agent is already at target version
    if (normalizeVersion(command.agentVersion) === normalizeVersion(forceCheck.force_update_version)) {
      logger.info('[ProcessHeartbeat] Agent already at target version, clearing flag', {
        agentName: command.agentName,
        version: command.agentVersion,
      });
      await this.clearForceUpdateFlag(command.agentId);
      return null;
    }

    // Check delivery count limit
    const deliveredCount = forceCheck.force_update_delivered_count || 0;
    if (deliveredCount >= 50) {
      logger.warn('[ProcessHeartbeat] Force update delivery limit reached', {
        agentName: command.agentName,
        deliveredCount,
      });
      await this.clearForceUpdateFlag(command.agentId);
      return null;
    }

    // Increment delivery count
    await this.supabase
      .from('agents')
      .update({
        force_update_delivered_count: deliveredCount + 1,
        force_update_first_delivered_at: forceCheck.force_update_first_delivered_at || new Date().toISOString(),
      })
      .eq('id', command.agentId);

    // Fetch release
    const platform = command.osType || 'windows';
    const { data: release } = await this.supabase
      .from('agent_releases')
      .select('version, script_content, sha256')
      .eq('version', forceCheck.force_update_version)
      .eq('platform', platform)
      .eq('is_active', true)
      .single();

    if (!release) {
      logger.warn('[ProcessHeartbeat] Force update release not found', {
        agentName: command.agentName,
        targetVersion: forceCheck.force_update_version,
      });
      return null;
    }

    const normalizedScript = normalizeForWindows(release.script_content);
    const scriptBytes = new TextEncoder().encode(normalizedScript);
    const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedSha256 = hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join('');

    // Base64 encode
    const { encodeBase64 } = await import('https://deno.land/std@0.208.0/encoding/base64.ts');
    const base64Script = encodeBase64(scriptBytes);

    const overrideValid = forceCheck.force_update_override_safe_mode &&
      (!forceCheck.force_update_override_safe_mode_expires_at ||
        new Date(forceCheck.force_update_override_safe_mode_expires_at) > new Date());

    return {
      forceUpdate: true,
      targetVersion: release.version,
      scriptContentBase64: base64Script,
      sha256: calculatedSha256,
      reason: forceCheck.force_update_reason || 'Forced update via backend',
      overrideSafeMode: !!overrideValid,
    };
  }

  private async clearForceUpdateFlag(agentId: string): Promise<void> {
    await this.supabase
      .from('agents')
      .update({
        force_update_version: null,
        force_update_reason: null,
        force_update_delivered_count: 0,
        force_update_first_delivered_at: null,
        force_update_override_safe_mode: false,
        force_update_override_safe_mode_expires_at: null,
      })
      .eq('id', agentId);
  }
}
