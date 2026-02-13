import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { DomainError, InvalidArgumentError } from '../shared/DomainError';

// ── Props ──

export interface NetworkMetricsProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  interfaceName: string;
  bytesSent: number;
  bytesReceived: number;
  packetsSent: number;
  packetsReceived: number;
  errorsSent: number;
  errorsReceived: number;
  connectionsActive: number;
  connectionsListening: number;
  collectedAt: Date;
  createdAt: Date;
}

export interface CreateNetworkMetricsProps {
  agentId: AgentId;
  tenantId: TenantId;
  interfaceName: string;
  bytesSent: number;
  bytesReceived: number;
  packetsSent?: number;
  packetsReceived?: number;
  errorsSent?: number;
  errorsReceived?: number;
  connectionsActive?: number;
  connectionsListening?: number;
}

// ── Entity ──

export class NetworkMetrics {
  private props: NetworkMetricsProps;

  private constructor(props: NetworkMetricsProps) {
    this.props = props;
  }

  static create(input: CreateNetworkMetricsProps): Result<NetworkMetrics, DomainError> {
    if (!input.interfaceName) {
      return Result.failure(new InvalidArgumentError('NetworkMetrics', 'interfaceName is required'));
    }

    return Result.success(new NetworkMetrics({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      tenantId: input.tenantId,
      interfaceName: input.interfaceName,
      bytesSent: input.bytesSent,
      bytesReceived: input.bytesReceived,
      packetsSent: input.packetsSent ?? 0,
      packetsReceived: input.packetsReceived ?? 0,
      errorsSent: input.errorsSent ?? 0,
      errorsReceived: input.errorsReceived ?? 0,
      connectionsActive: input.connectionsActive ?? 0,
      connectionsListening: input.connectionsListening ?? 0,
      collectedAt: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: NetworkMetricsProps): NetworkMetrics {
    return new NetworkMetrics(props);
  }

  get totalBytes(): number {
    return this.props.bytesSent + this.props.bytesReceived;
  }

  get totalErrors(): number {
    return this.props.errorsSent + this.props.errorsReceived;
  }

  get errorRate(): number {
    const totalPackets = this.props.packetsSent + this.props.packetsReceived;
    if (totalPackets === 0) return 0;
    return this.totalErrors / totalPackets;
  }

  get hasHighErrorRate(): boolean {
    return this.errorRate > 0.05; // >5% packet error rate
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get interfaceName(): string { return this.props.interfaceName; }
  get bytesSent(): number { return this.props.bytesSent; }
  get bytesReceived(): number { return this.props.bytesReceived; }
  get packetsSent(): number { return this.props.packetsSent; }
  get packetsReceived(): number { return this.props.packetsReceived; }
  get errorsSent(): number { return this.props.errorsSent; }
  get errorsReceived(): number { return this.props.errorsReceived; }
  get connectionsActive(): number { return this.props.connectionsActive; }
  get connectionsListening(): number { return this.props.connectionsListening; }
  get collectedAt(): Date { return this.props.collectedAt; }
  get createdAt(): Date { return this.props.createdAt; }
}
