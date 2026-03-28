import { LightModeConfig, DEFAULT_MEDIA_PROCESSES } from '../../../../domain/entities/LightModeConfig';
import { AgentId } from '../../../../domain/value-objects/AgentId';

/**
 * Maps between LightModeConfig domain entity and Supabase database rows.
 */
export class LightModeConfigMapper {
  static toDomain(row: Record<string, unknown>): LightModeConfig {
    const agentIdResult = AgentId.create(row.agent_id);
    if (agentIdResult.isFailure) {
      throw new Error(`Invalid agent_id in light_mode_configs: ${row.agent_id}`);
    }

    return LightModeConfig.reconstitute({
      id: row.id,
      agentId: agentIdResult.value,
      isActive: row.is_active ?? false,
      activatedAt: row.activated_at ? new Date(row.activated_at) : null,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      reason: row.reason ?? '',
      collectionIntervalSeconds: row.collection_interval_seconds ?? 60,
      skipProcessCollection: row.skip_process_collection ?? false,
      skipNetworkCollection: row.skip_network_collection ?? false,
      compressPayloads: row.compress_payloads ?? false,
      thresholds: {
        cpuThresholdPercent: row.cpu_threshold_percent ?? 50,
        networkThresholdMbps: row.network_threshold_mbps ?? 10,
        mediaProcesses: row.media_processes ?? [...DEFAULT_MEDIA_PROCESSES],
        durationMinutes: row.duration_minutes ?? 15,
        reducedIntervalSeconds: row.reduced_interval_seconds ?? 600,
      },
      activeMediaProcesses: row.active_media_processes ?? [],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toPersistence(entity: LightModeConfig): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      is_active: entity.isActive,
      activated_at: entity.activatedAt?.toISOString() ?? null,
      expires_at: entity.expiresAt?.toISOString() ?? null,
      reason: entity.reason,
      collection_interval_seconds: entity.collectionIntervalSeconds,
      skip_process_collection: entity.skipProcessCollection,
      skip_network_collection: entity.skipNetworkCollection,
      compress_payloads: entity.compressPayloads,
      cpu_threshold_percent: entity.thresholds.cpuThresholdPercent,
      network_threshold_mbps: entity.thresholds.networkThresholdMbps,
      media_processes: entity.thresholds.mediaProcesses,
      duration_minutes: entity.thresholds.durationMinutes,
      reduced_interval_seconds: entity.thresholds.reducedIntervalSeconds,
      active_media_processes: entity.activeMediaProcesses,
    };
  }
}
