import { Agent, type AgentProps, AgentState, AgentStatus } from '@/domain/entities/Agent';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';

/**
 * Maps between Supabase DB rows and Agent domain entities.
 */
export class AgentMapper {
  static toDomain(row: Record<string, any>): Agent {
    const props: AgentProps = {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.agent_name ?? row.hostname ?? '',
      osType: row.os_type ?? 'windows',
      state: AgentMapper.mapLifecycleState(row.status),
      status: AgentMapper.mapAgentStatus(row.status, row.last_seen),
      version: row.agent_version ?? null,
      lastSeen: row.last_seen ?? null,
      hmacSecret: '', // V-1005: Never expose hmac_secret to domain/UI layer
      lightModeConfig: row.light_mode_config ?? undefined,
    };

    return Agent.reconstitute(props);
  }

  static toPersistence(entity: Agent): Record<string, any> {
    return {
      id: entity.id.value,
      tenant_id: entity.tenantId.value,
      agent_name: entity.name,
      os_type: entity.osType,
      status: entity.state === AgentState.ACTIVE ? 'active' : entity.state,
      agent_version: entity.version?.normalized ?? null,
      last_seen: entity.lastSeen?.toISOString() ?? null,
      light_mode_enabled: entity.isInLightMode(),
    };
  }

  private static mapLifecycleState(dbStatus: string): string {
    switch (dbStatus) {
      case 'active': return AgentState.ACTIVE;
      case 'inactive': return AgentState.INACTIVE;
      case 'suspended': return AgentState.SUSPENDED;
      case 'decommissioned': return AgentState.DECOMMISSIONED;
      case 'enrolled': return AgentState.ENROLLED;
      default: return AgentState.ENROLLED;
    }
  }

  private static mapAgentStatus(dbStatus: string, lastSeen: string | null): string {
    if (dbStatus === 'decommissioned' || dbStatus === 'suspended') {
      return AgentStatus.OFFLINE;
    }
    // Use centralized threshold from AGENT_STATUS_THRESHOLDS
    if (!lastSeen) return AgentStatus.OFFLINE;
    const elapsed = Date.now() - new Date(lastSeen).getTime();
    if (elapsed > AGENT_STATUS_THRESHOLDS.OFFLINE_MIN_MINUTES * 60 * 1000) return AgentStatus.OFFLINE;
    return AgentStatus.ONLINE;
  }
}
