import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { DomainError, InvalidArgumentError } from '../shared/DomainError';

// ── Enums ──

export enum BaselineType {
  PROCESS_PATTERNS = 'process_patterns',
  NETWORK_PATTERNS = 'network_patterns',
  FILE_CHANGES = 'file_changes',
}

export enum AnomalySeverity {
  INFO = 'info',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// ── Types ──

export interface StatisticalThresholds {
  mean: number;
  stdDev: number;
  multiplier: number;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  deviation: number;
  severity: AnomalySeverity;
}

export interface BehavioralBaselineProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  type: BaselineType;
  data: Record<string, unknown>;
  thresholds: StatisticalThresholds;
  periodStart?: Date;
  periodEnd?: Date;
  isActive: boolean;
  lastUpdated: Date;
  createdAt: Date;
}

export interface CreateBehavioralBaselineProps {
  agentId: AgentId;
  tenantId: TenantId;
  type: BaselineType;
  data: Record<string, unknown>;
  thresholds: StatisticalThresholds;
  periodStart?: Date;
  periodEnd?: Date;
}

// ── Entity ──

export class BehavioralBaseline {
  private props: BehavioralBaselineProps;

  private constructor(props: BehavioralBaselineProps) {
    this.props = props;
  }

  static create(input: CreateBehavioralBaselineProps): Result<BehavioralBaseline, DomainError> {
    if (input.thresholds.multiplier <= 0) {
      return Result.failure(new InvalidArgumentError('BehavioralBaseline', 'Threshold multiplier must be > 0'));
    }

    return Result.success(new BehavioralBaseline({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      tenantId: input.tenantId,
      type: input.type,
      data: input.data,
      thresholds: input.thresholds,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      isActive: true,
      lastUpdated: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: BehavioralBaselineProps): BehavioralBaseline {
    return new BehavioralBaseline(props);
  }

  detectAnomaly(currentValue: number): AnomalyResult {
    const { mean, stdDev, multiplier } = this.props.thresholds;
    const threshold = mean + stdDev * multiplier;

    if (currentValue > threshold) {
      const deviation = currentValue - mean;
      const severity = currentValue > mean + stdDev * 3
        ? AnomalySeverity.CRITICAL
        : AnomalySeverity.HIGH;
      return { isAnomaly: true, deviation, severity };
    }

    return { isAnomaly: false, deviation: 0, severity: AnomalySeverity.INFO };
  }

  updateThresholds(newThresholds: StatisticalThresholds): void {
    this.props.thresholds = newThresholds;
    this.props.lastUpdated = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.lastUpdated = new Date();
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get type(): BaselineType { return this.props.type; }
  get data(): Record<string, unknown> { return this.props.data; }
  get thresholds(): StatisticalThresholds { return this.props.thresholds; }
  get periodStart(): Date | undefined { return this.props.periodStart; }
  get periodEnd(): Date | undefined { return this.props.periodEnd; }
  get isActive(): boolean { return this.props.isActive; }
  get lastUpdated(): Date { return this.props.lastUpdated; }
  get createdAt(): Date { return this.props.createdAt; }
}
