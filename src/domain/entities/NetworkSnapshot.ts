import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

export interface NetworkAdapter {
  name: string;
  ipAddress: string;
  macAddress: string;
  status: string;
}

export interface OpenPort {
  port: number;
  process: string;
  protocol: string;
}

export interface ActiveConnection {
  remoteAddress: string;
  remotePort: number;
  state: string;
}

export interface NetworkSnapshotProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  firewallDomain: boolean | null;
  firewallPrivate: boolean | null;
  firewallPublic: boolean | null;
  openPorts: OpenPort[];
  activeConnections: ActiveConnection[];
  networkAdapters: NetworkAdapter[];
  dnsServers: string[];
  gatewayIp: string | null;
  publicIp: string | null;
  dnsTestSuccess: boolean | null;
  httpsTestSuccess: boolean | null;
  collectedAt: Date;
  createdAt: Date;
}

/**
 * NetworkSnapshot entity.
 * Represents a point-in-time network state from an agent.
 */
export class NetworkSnapshot {
  private props: NetworkSnapshotProps;

  private constructor(props: NetworkSnapshotProps) {
    this.props = props;
  }

  static create(
    agentId: AgentId,
    tenantId: TenantId,
    data: Omit<NetworkSnapshotProps, 'id' | 'agentId' | 'tenantId' | 'collectedAt' | 'createdAt'>
  ): Result<NetworkSnapshot, InvalidArgumentError> {
    if (!agentId || !tenantId) {
      return Result.failure(new InvalidArgumentError('NetworkSnapshot', 'AgentId and TenantId required'));
    }

    return Result.success(new NetworkSnapshot({
      id: crypto.randomUUID(),
      agentId,
      tenantId,
      ...data,
      collectedAt: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: NetworkSnapshotProps): NetworkSnapshot {
    return new NetworkSnapshot(props);
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get firewallDomain(): boolean | null { return this.props.firewallDomain; }
  get firewallPrivate(): boolean | null { return this.props.firewallPrivate; }
  get firewallPublic(): boolean | null { return this.props.firewallPublic; }
  get openPorts(): OpenPort[] { return this.props.openPorts; }
  get activeConnections(): ActiveConnection[] { return this.props.activeConnections; }
  get networkAdapters(): NetworkAdapter[] { return this.props.networkAdapters; }
  get dnsServers(): string[] { return this.props.dnsServers; }
  get gatewayIp(): string | null { return this.props.gatewayIp; }
  get publicIp(): string | null { return this.props.publicIp; }
  get dnsTestSuccess(): boolean | null { return this.props.dnsTestSuccess; }
  get httpsTestSuccess(): boolean | null { return this.props.httpsTestSuccess; }
  get collectedAt(): Date { return this.props.collectedAt; }

  /**
   * Check if all firewall profiles are enabled.
   */
  get isFullyFirewalled(): boolean {
    return this.props.firewallDomain === true
      && this.props.firewallPrivate === true
      && this.props.firewallPublic === true;
  }

  /**
   * Check if any firewall profile is disabled.
   */
  get hasFirewallGap(): boolean {
    return this.props.firewallDomain === false
      || this.props.firewallPrivate === false
      || this.props.firewallPublic === false;
  }

  /**
   * Check connectivity health.
   */
  get hasConnectivityIssues(): boolean {
    return this.props.dnsTestSuccess === false || this.props.httpsTestSuccess === false;
  }

  /**
   * Get commonly risky open ports.
   */
  get riskyPorts(): OpenPort[] {
    const riskyPortNumbers = [21, 23, 135, 139, 445, 3389, 5900, 5985, 5986];
    return this.props.openPorts.filter(p => riskyPortNumbers.includes(p.port));
  }
}
