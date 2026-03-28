import { ProcessSnapshot, ProcessEntry, ServiceEntry } from '../../../../domain/entities/ProcessSnapshot';
import { AgentId } from '../../../../domain/value-objects/AgentId';
import { TenantId } from '../../../../domain/value-objects/TenantId';

/**
 * Maps between ProcessSnapshot domain entity and Supabase database rows.
 */
export class ProcessSnapshotMapper {
  static toDomain(row: Record<string, any>): ProcessSnapshot {
    const processes: ProcessEntry[] = (row.processes || []).map((p: Record<string, unknown>) => ({
      pid: p.pid,
      name: p.name,
      cpuPercent: p.cpu_percent ?? 0,
      memoryMb: p.memory_mb ?? 0,
      user: p.user ?? '',
      commandLine: p.command_line,
      startTime: p.start_time ? new Date(p.start_time) : undefined,
    }));

    const services: ServiceEntry[] = (row.services || []).map((s: Record<string, unknown>) => ({
      name: s.name,
      displayName: s.display_name ?? s.name,
      status: s.status,
      startupType: s.startup_type ?? 'Manual',
      description: s.description,
    }));

    const newProcesses: ProcessEntry[] = (row.new_processes || []).map((p: Record<string, unknown>) => ({
      pid: p.pid,
      name: p.name,
      cpuPercent: p.cpu_percent ?? 0,
      memoryMb: p.memory_mb ?? 0,
      user: p.user ?? '',
      commandLine: p.command_line,
    }));

    const suspiciousProcesses: ProcessEntry[] = (row.suspicious_processes || []).map((p: Record<string, unknown>) => ({
      pid: p.pid,
      name: p.name,
      cpuPercent: p.cpu_percent ?? 0,
      memoryMb: p.memory_mb ?? 0,
      user: p.user ?? '',
      commandLine: p.command_line,
    }));

    return ProcessSnapshot.reconstitute({
      id: row.id,
      agentId: AgentId.create(row.agent_id).value,
      tenantId: TenantId.create(row.tenant_id).value,
      processes,
      services,
      totalProcesses: row.total_processes ?? processes.length,
      totalServices: row.total_services ?? services.length,
      servicesRunning: row.services_running ?? 0,
      servicesStopped: row.services_stopped ?? 0,
      newProcesses,
      suspiciousProcesses,
      collectedAt: new Date(row.collected_at),
      createdAt: new Date(row.created_at),
    });
  }

  static toPersistence(entity: ProcessSnapshot): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      processes: entity.processes.map(p => ({
        pid: p.pid,
        name: p.name,
        cpu_percent: p.cpuPercent,
        memory_mb: p.memoryMb,
        user: p.user,
        command_line: p.commandLine,
      })),
      services: entity.services.map(s => ({
        name: s.name,
        display_name: s.displayName,
        status: s.status,
        startup_type: s.startupType,
        description: s.description,
      })),
      total_processes: entity.totalProcesses,
      total_services: entity.totalServices,
      services_running: entity.servicesRunning,
      services_stopped: entity.servicesStopped,
      new_processes: entity.newProcesses.map(p => ({
        pid: p.pid, name: p.name, cpu_percent: p.cpuPercent,
        memory_mb: p.memoryMb, user: p.user, command_line: p.commandLine,
      })),
      suspicious_processes: entity.suspiciousProcesses.map(p => ({
        pid: p.pid, name: p.name, cpu_percent: p.cpuPercent,
        memory_mb: p.memoryMb, user: p.user, command_line: p.commandLine,
      })),
      collected_at: entity.collectedAt.toISOString(),
    };
  }
}
