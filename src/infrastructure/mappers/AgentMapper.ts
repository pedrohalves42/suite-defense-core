import { Agent, type AgentProps, AgentLifecycleState, AgentStatus, OsType } from '@/domain/entities/Agent';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';
import { AgentVersion } from '@/domain/value-objects/AgentVersion';

/**
 * Maps between Supabase DB rows and Agent domain entities.
 */
export class AgentMapper {
  static toDomain(row: Record<string, any>): Agent {
    const agentIdResult = AgentId.create(row.id);
    if (agentIdResult.isFailure) throw new Error(`Invalid agent id in DB row: ${row.id}`);

    const tenantIdResult = TenantId.create(row.tenant_id);
    if (tenantIdResult.isFailure) throw new Error(`Invalid tenant_id in DB row: ${row.tenant_id}`);

    let version: AgentVersion | null = null;
    if (row.agent_version) {
      const versionResult = AgentVersion.create(row.agent_version);
      if (versionResult.isSuccess) {
        version = versionResult.value;
      }
    }

    const props: AgentProps = {
      id: agentIdResult.value,
      tenantId: tenantIdResult.value,
      name: row.agent_name ?? row.hostname ?? '',
      osType: (row.os_type ?? 'windows') as OsType,
      state: AgentMapper.mapLifecycleState(row.status),
      status: AgentMapper.mapAgentStatus(row.status, row.last_seen),
      version,
      lastHeartbeatAt: row.last_seen ? new Date(row.last_seen) : null,
      hmacSecret: row.hmac_secret ?? null,
      lightModeEnabled: row.light_mode_enabled ?? false,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at ?? row.created_at),
    };

    return Agent.reconstitute(props);
  }

  static toPersistence(entity: Agent): Record<string, any> {
    return {
      id: entity.id.value,
      tenant_id: entity.tenantId.value,
      agent_name: entity.name,
      os_type: entity.osType,
      status: entity.state === AgentLifecycleState.ACTIVE ? 'active' : entity.state,
      agent_version: entity.version?.normalized ?? null,
      last_seen: entity.lastHeartbeatAt?.toISOString() ?? null,
      light_mode_enabled: entity.lightModeEnabled,
    };
  }

  private static mapLifecycleState(dbStatus: string): AgentLifecycleState {
    switch (dbStatus) {
      case 'active': return AgentLifecycleState.ACTIVE;
      case 'inactive': return AgentLifecycleState.INACTIVE;
      case 'suspended': return AgentLifecycleState.SUSPENDED;
      case 'decommissioned': return AgentLifecycleState.DECOMMISSIONED;
      case 'enrolled': return AgentLifecycleState.ENROLLED;
      default: return AgentLifecycleState.ENROLLED;
    }
  }

  private static mapAgentStatus(dbStatus: string, lastSeen: string | null): AgentStatus {
    if (dbStatus === 'decommissioned' || dbStatus === 'suspended') {
      return AgentStatus.OFFLINE;
    }
    if (!lastSeen) return AgentStatus.OFFLINE;
    const elapsed = Date.now() - new Date(lastSeen).getTime();
    if (elapsed > 5 * 60 * 1000) return AgentStatus.OFFLINE;
    return AgentStatus.ONLINE;
  }
}
