import { Agent, type AgentProps, AgentState, AgentStatus } from '@/domain/entities/Agent';
import { AGENT_STATUS_THRESHOLDS } from '@/lib/agent-status-constants';
import type { AgentInsert } from '@/infrastructure/types/supabase-tables';

/**
 * Maps between Supabase DB rows and Agent domain entities.
 */
export class AgentMapper {
  static toDomain(row: Record<string, unknown>): Agent {
    const props: AgentProps = {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      name: (row.agent_name as string) ?? (row.hostname as string) ?? '',
      osType: (row.os_type as string) ?? 'windows',
      state: AgentMapper.mapLifecycleState(row.status as string),
      status: AgentMapper.mapAgentStatus(row.status as string, row.last_seen as string | null),
      version: (row.agent_version as string) ?? null,
      lastSeen: (row.last_seen as string) ?? null,
      hmacSecret: '', // V-1005: Never expose hmac_secret to domain/UI layer
      lightModeConfig: (row.light_mode_config as Record<string, unknown>) ?? undefined,
    };

    return Agent.reconstitute(props);
  }

  static toPersistence(entity: Agent): AgentInsert {
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
