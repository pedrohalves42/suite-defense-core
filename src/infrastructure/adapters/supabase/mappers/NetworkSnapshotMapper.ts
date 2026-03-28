import { NetworkSnapshot, NetworkAdapter, OpenPort, ActiveConnection } from '../../../../domain/entities/NetworkSnapshot';
import { AgentId } from '../../../../domain/value-objects/AgentId';
import { TenantId } from '../../../../domain/value-objects/TenantId';

/**
 * Maps between NetworkSnapshot domain entity and Supabase database rows.
 */
export class NetworkSnapshotMapper {
  static toDomain(row: Record<string, any>): NetworkSnapshot {
    const adapters: NetworkAdapter[] = (row.network_adapters || []).map((a: Record<string, unknown>) => ({
      name: a.name ?? '',
      ipAddress: a.ip_address ?? a.ipAddress ?? '',
      macAddress: a.mac_address ?? a.macAddress ?? '',
      status: a.status ?? 'Unknown',
    }));

    const openPorts: OpenPort[] = (row.open_ports || []).map((p: Record<string, unknown>) => ({
      port: p.port,
      process: p.process ?? '',
      protocol: p.protocol ?? 'TCP',
    }));

    const connections: ActiveConnection[] = (row.active_connections || []).map((c: Record<string, unknown>) => ({
      remoteAddress: c.remote_address ?? c.remoteAddress ?? '',
      remotePort: c.remote_port ?? c.remotePort ?? 0,
      state: c.state ?? '',
    }));

    const dnsServers: string[] = (row.dns_servers || []).map((d: Record<string, unknown>) =>
      typeof d === 'string' ? d : d.address ?? ''
    );

    return NetworkSnapshot.reconstitute({
      id: row.id,
      agentId: AgentId.create(row.agent_id).value,
      tenantId: TenantId.create(row.tenant_id).value,
      firewallDomain: row.firewall_domain,
      firewallPrivate: row.firewall_private,
      firewallPublic: row.firewall_public,
      openPorts,
      activeConnections: connections,
      networkAdapters: adapters,
      dnsServers,
      gatewayIp: row.gateway_ip,
      publicIp: row.public_ip,
      dnsTestSuccess: row.dns_test_success,
      httpsTestSuccess: row.https_test_success,
      collectedAt: new Date(row.collected_at),
      createdAt: new Date(row.created_at),
    });
  }

  static toPersistence(entity: NetworkSnapshot): Record<string, unknown> {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      firewall_domain: entity.firewallDomain,
      firewall_private: entity.firewallPrivate,
      firewall_public: entity.firewallPublic,
      open_ports: entity.openPorts.map(p => ({
        port: p.port, process: p.process, protocol: p.protocol,
      })),
      active_connections: entity.activeConnections.map(c => ({
        remote_address: c.remoteAddress, remote_port: c.remotePort, state: c.state,
      })),
      network_adapters: entity.networkAdapters.map(a => ({
        name: a.name, ip_address: a.ipAddress, mac_address: a.macAddress, status: a.status,
      })),
      dns_servers: entity.dnsServers,
      gateway_ip: entity.gatewayIp,
      public_ip: entity.publicIp,
      dns_test_success: entity.dnsTestSuccess,
      https_test_success: entity.httpsTestSuccess,
      collected_at: entity.collectedAt.toISOString(),
    };
  }
}
