import { HardwareMetrics, CpuMetrics, MemoryMetrics, DiskMetrics } from '../../../../domain/entities/HardwareMetrics';
import { AgentId } from '../../../../domain/value-objects/AgentId';
import { TenantId } from '../../../../domain/value-objects/TenantId';

/**
 * Maps between HardwareMetrics domain entity and Supabase database rows.
 */
export class HardwareMetricsMapper {
  static toDomain(row: Record<string, any>): HardwareMetrics {
    const cpu = CpuMetrics.create({
      usagePercent: row.cpu_usage_percent ?? 0,
      cores: row.cpu_cores ?? 1,
      logicalProcessors: row.cpu_cores,
      model: row.cpu_name,
    });

    const memory = MemoryMetrics.create({
      totalGb: row.memory_total_gb ?? 0,
      usedGb: row.memory_used_gb ?? 0,
      freeGb: row.memory_free_gb ?? 0,
      usagePercent: row.memory_usage_percent ?? 0,
    });

    const disk = DiskMetrics.create({
      totalGb: row.disk_total_gb ?? 0,
      usedGb: row.disk_used_gb ?? 0,
      freeGb: row.disk_free_gb ?? 0,
      usagePercent: row.disk_usage_percent ?? 0,
    });

    if (cpu.isFailure || memory.isFailure || disk.isFailure) {
      throw new Error('Failed to map HardwareMetrics from database row');
    }

    return HardwareMetrics.reconstitute({
      id: row.id,
      agentId: AgentId.create(row.agent_id).value,
      tenantId: TenantId.create(row.tenant_id).value,
      cpu: cpu.value,
      memory: memory.value,
      disk: disk.value,
      uptimeSeconds: row.uptime_seconds ?? 0,
      osVersion: row.os_version ?? '',
      hostname: row.hostname ?? '',
      osBuild: row.os_build,
      collectedAt: new Date(row.collected_at),
      createdAt: new Date(row.created_at),
    });
  }

  static toPersistence(entity: HardwareMetrics): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      cpu_usage_percent: entity.cpu.usagePercent,
      cpu_name: entity.cpu.model,
      cpu_cores: entity.cpu.cores,
      memory_total_gb: entity.memory.totalGb,
      memory_used_gb: entity.memory.usedGb,
      memory_free_gb: entity.memory.freeGb,
      memory_usage_percent: entity.memory.usagePercent,
      disk_total_gb: entity.disk.totalGb,
      disk_used_gb: entity.disk.usedGb,
      disk_free_gb: entity.disk.freeGb,
      disk_usage_percent: entity.disk.usagePercent,
      uptime_seconds: entity.uptimeSeconds,
      collected_at: entity.collectedAt.toISOString(),
    };
  }
}
