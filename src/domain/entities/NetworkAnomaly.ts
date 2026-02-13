import { Entity } from '../shared/Entity';
import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { DomainError } from '../shared/DomainError';
import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';

// ─── Enums ──────────────────────────────────────────────

export enum NetworkAnomalyType {
  HIGH_VOLUME_UNUSUAL_PORT = 'high_volume_unusual_port',
  KNOWN_MALICIOUS_IP = 'known_malicious_ip',
  UNUSUAL_PROTOCOL_USAGE = 'unusual_protocol_usage',
  PORT_SCANNING = 'port_scanning',
  DATA_EXFILTRATION = 'data_exfiltration',
  UNUSUAL_TRAFFIC_PATTERN = 'unusual_traffic_pattern',
}

export enum AnomalySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ─── Value Object ───────────────────────────────────────

export class NetworkAnomalyId extends ValueObject<string> {
  static generate(): NetworkAnomalyId { return new NetworkAnomalyId(crypto.randomUUID()); }
  static create(value: string): Result<NetworkAnomalyId, DomainError> {
    if (!value) return Result.failure(new DomainError('NetworkAnomalyId cannot be empty'));
    return Result.success(new NetworkAnomalyId(value));
  }
}

// ─── Detection Props ────────────────────────────────────

export interface DetectNetworkAnomalyProps {
  agentId: AgentId;
  tenantId: TenantId;
  sourceIp: string;
  destinationIp: string;
  destinationPort: number;
  protocol: string;
  bytesTransferred: number;
  isKnownMalicious: boolean;
  uniquePortsConnected: number;
  isOutbound: boolean;
}

export interface NetworkBlockPolicy {
  blockThreshold: number;          // confidence % to auto-block
  monitorThreshold: number;        // confidence % to monitor
  blockedAnomalyTypes: NetworkAnomalyType[];
}

// ─── Entity ─────────────────────────────────────────────

export class NetworkAnomaly extends Entity<NetworkAnomalyId> {
  private _agentId: AgentId;
  private _tenantId: TenantId;
  private _anomalyType: NetworkAnomalyType;
  private _severity: AnomalySeverity;
  private _sourceIp: string;
  private _destinationIp: string;
  private _destinationPort: number;
  private _protocol: string;
  private _bytesTransferred: number;
  private _confidence: number;
  private _blocked: boolean;
  private _blockReason: string | null;
  private _detectedAt: Date;

  private constructor(
    id: NetworkAnomalyId,
    props: {
      agentId: AgentId;
      tenantId: TenantId;
      anomalyType: NetworkAnomalyType;
      severity: AnomalySeverity;
      sourceIp: string;
      destinationIp: string;
      destinationPort: number;
      protocol: string;
      bytesTransferred: number;
      confidence: number;
      blocked: boolean;
      blockReason: string | null;
      detectedAt: Date;
    },
  ) {
    super(id);
    Object.assign(this, {
      _agentId: props.agentId,
      _tenantId: props.tenantId,
      _anomalyType: props.anomalyType,
      _severity: props.severity,
      _sourceIp: props.sourceIp,
      _destinationIp: props.destinationIp,
      _destinationPort: props.destinationPort,
      _protocol: props.protocol,
      _bytesTransferred: props.bytesTransferred,
      _confidence: props.confidence,
      _blocked: props.blocked,
      _blockReason: props.blockReason,
      _detectedAt: props.detectedAt,
    });
  }

  static detect(props: DetectNetworkAnomalyProps): Result<NetworkAnomaly, DomainError> {
    const anomalyType = NetworkAnomaly.determineType(props);
    const severity = NetworkAnomaly.calculateSeverity(anomalyType);
    const confidence = NetworkAnomaly.calculateConfidence(props, anomalyType);

    return Result.success(new NetworkAnomaly(
      NetworkAnomalyId.generate(),
      {
        agentId: props.agentId,
        tenantId: props.tenantId,
        anomalyType,
        severity,
        sourceIp: props.sourceIp,
        destinationIp: props.destinationIp,
        destinationPort: props.destinationPort,
        protocol: props.protocol,
        bytesTransferred: props.bytesTransferred,
        confidence,
        blocked: false,
        blockReason: null,
        detectedAt: new Date(),
      },
    ));
  }

  private static determineType(props: DetectNetworkAnomalyProps): NetworkAnomalyType {
    if (props.isKnownMalicious) return NetworkAnomalyType.KNOWN_MALICIOUS_IP;
    if (props.uniquePortsConnected > 100) return NetworkAnomalyType.PORT_SCANNING;
    if (props.isOutbound && props.bytesTransferred > 50_000_000) return NetworkAnomalyType.DATA_EXFILTRATION;
    if (props.bytesTransferred > 1_000_000 && props.destinationPort > 49152) return NetworkAnomalyType.HIGH_VOLUME_UNUSUAL_PORT;
    if (props.protocol === 'ICMP' && props.bytesTransferred > 10_000) return NetworkAnomalyType.UNUSUAL_PROTOCOL_USAGE;
    return NetworkAnomalyType.UNUSUAL_TRAFFIC_PATTERN;
  }

  private static calculateSeverity(type: NetworkAnomalyType): AnomalySeverity {
    switch (type) {
      case NetworkAnomalyType.KNOWN_MALICIOUS_IP:
      case NetworkAnomalyType.DATA_EXFILTRATION:
        return AnomalySeverity.CRITICAL;
      case NetworkAnomalyType.PORT_SCANNING:
      case NetworkAnomalyType.HIGH_VOLUME_UNUSUAL_PORT:
        return AnomalySeverity.HIGH;
      case NetworkAnomalyType.UNUSUAL_PROTOCOL_USAGE:
        return AnomalySeverity.MEDIUM;
      default:
        return AnomalySeverity.LOW;
    }
  }

  private static calculateConfidence(props: DetectNetworkAnomalyProps, type: NetworkAnomalyType): number {
    let confidence = 50;
    if (props.isKnownMalicious) confidence += 40;
    if (props.bytesTransferred > 10_000_000) confidence += 20;
    if (props.uniquePortsConnected > 50) confidence += 15;
    if (type === NetworkAnomalyType.DATA_EXFILTRATION) confidence += 10;
    return Math.min(confidence, 100);
  }

  shouldBlock(policy: NetworkBlockPolicy): boolean {
    if (this._blocked) return false;
    if (this._anomalyType === NetworkAnomalyType.KNOWN_MALICIOUS_IP) return true;
    if (this._confidence >= policy.blockThreshold) return true;
    if (policy.blockedAnomalyTypes.includes(this._anomalyType)) return true;
    return false;
  }

  block(reason: string): void {
    this._blocked = true;
    this._blockReason = reason;
  }

  // ─── Getters ──────────────────────────────────────────

  get agentId(): AgentId { return this._agentId; }
  get tenantId(): TenantId { return this._tenantId; }
  get anomalyType(): NetworkAnomalyType { return this._anomalyType; }
  get severity(): AnomalySeverity { return this._severity; }
  get confidence(): number { return this._confidence; }
  get blocked(): boolean { return this._blocked; }
  get sourceIp(): string { return this._sourceIp; }
  get destinationIp(): string { return this._destinationIp; }
  get destinationPort(): number { return this._destinationPort; }
  get protocol(): string { return this._protocol; }
  get bytesTransferred(): number { return this._bytesTransferred; }
  get blockReason(): string | null { return this._blockReason; }
  get detectedAt(): Date { return this._detectedAt; }
}
