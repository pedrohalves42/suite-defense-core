import { NetworkMetrics } from '@/domain/entities/NetworkMetrics';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';

export class NetworkMetricsMapper {
  static toDomain(row: Record<string, any>): NetworkMetrics {
    return NetworkMetrics.reconstitute({
      id: row.id as string,
      agentId: AgentId.create(row.agent_id as string).value,
      tenantId: TenantId.create(row.tenant_id as string).value,
      interfaceName: row.interface_name as string,
      bytesSent: (row.bytes_sent as number) ?? 0,
      bytesReceived: (row.bytes_received as number) ?? 0,
      packetsSent: (row.packets_sent as number) ?? 0,
      packetsReceived: (row.packets_received as number) ?? 0,
      errorsSent: (row.errors_sent as number) ?? 0,
      errorsReceived: (row.errors_received as number) ?? 0,
      connectionsActive: (row.connections_active as number) ?? 0,
      connectionsListening: (row.connections_listening as number) ?? 0,
      collectedAt: new Date(row.collected_at as string),
      createdAt: new Date(row.created_at as string),
    });
  }

  static toPersistence(entity: NetworkMetrics): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      interface_name: entity.interfaceName,
      bytes_sent: entity.bytesSent,
      bytes_received: entity.bytesReceived,
      packets_sent: entity.packetsSent,
      packets_received: entity.packetsReceived,
      errors_sent: entity.errorsSent,
      errors_received: entity.errorsReceived,
      connections_active: entity.connectionsActive,
      connections_listening: entity.connectionsListening,
      collected_at: entity.collectedAt.toISOString(),
    };
  }
}
