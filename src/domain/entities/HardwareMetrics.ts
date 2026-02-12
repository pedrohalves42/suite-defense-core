import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { InvalidArgumentError, BusinessRuleViolationError } from '../shared/DomainError';

// ── Value Objects ──

interface CpuMetricsProps {
  usagePercent: number;
  cores: number;
  logicalProcessors?: number;
  model?: string;
}

export class CpuMetrics extends ValueObject<CpuMetricsProps> {
  static create(props: CpuMetricsProps): Result<CpuMetrics, InvalidArgumentError> {
    if (props.usagePercent < 0 || props.usagePercent > 100) {
      return Result.failure(new InvalidArgumentError('CpuMetrics', 'Usage must be 0-100'));
    }
    if (props.cores < 1) {
      return Result.failure(new InvalidArgumentError('CpuMetrics', 'Cores must be >= 1'));
    }
    return Result.success(new CpuMetrics(props));
  }

  get usagePercent(): number { return this._value.usagePercent; }
  get cores(): number { return this._value.cores; }
  get logicalProcessors(): number | undefined { return this._value.logicalProcessors; }
  get model(): string | undefined { return this._value.model; }

  get isCritical(): boolean { return this._value.usagePercent >= 90; }
  get isWarning(): boolean { return this._value.usagePercent >= 75; }
}

interface MemoryMetricsProps {
  totalGb: number;
  usedGb: number;
  freeGb: number;
  usagePercent: number;
}

export class MemoryMetrics extends ValueObject<MemoryMetricsProps> {
  static create(props: MemoryMetricsProps): Result<MemoryMetrics, InvalidArgumentError> {
    if (props.usagePercent < 0 || props.usagePercent > 100) {
      return Result.failure(new InvalidArgumentError('MemoryMetrics', 'Usage must be 0-100'));
    }
    if (props.totalGb < 0) {
      return Result.failure(new InvalidArgumentError('MemoryMetrics', 'Total must be >= 0'));
    }
    return Result.success(new MemoryMetrics(props));
  }

  get totalGb(): number { return this._value.totalGb; }
  get usedGb(): number { return this._value.usedGb; }
  get freeGb(): number { return this._value.freeGb; }
  get usagePercent(): number { return this._value.usagePercent; }

  get isCritical(): boolean { return this._value.usagePercent >= 90; }
  get isWarning(): boolean { return this._value.usagePercent >= 80; }
}

interface DiskMetricsProps {
  totalGb: number;
  usedGb: number;
  freeGb: number;
  usagePercent: number;
}

export class DiskMetrics extends ValueObject<DiskMetricsProps> {
  static create(props: DiskMetricsProps): Result<DiskMetrics, InvalidArgumentError> {
    if (props.usagePercent < 0 || props.usagePercent > 100) {
      return Result.failure(new InvalidArgumentError('DiskMetrics', 'Usage must be 0-100'));
    }
    return Result.success(new DiskMetrics(props));
  }

  get totalGb(): number { return this._value.totalGb; }
  get usedGb(): number { return this._value.usedGb; }
  get freeGb(): number { return this._value.freeGb; }
  get usagePercent(): number { return this._value.usagePercent; }

  get isCritical(): boolean { return this._value.usagePercent >= 90; }
  get isWarning(): boolean { return this._value.usagePercent >= 80; }
}

// ── Aggregate Root ──

export interface HardwareMetricsProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  uptimeSeconds: number;
  osVersion: string;
  hostname: string;
  osBuild?: string;
  collectedAt: Date;
  createdAt: Date;
}

/**
 * HardwareMetrics entity.
 * Represents a point-in-time hardware metrics snapshot from an agent.
 */
export class HardwareMetrics {
  private props: HardwareMetricsProps;

  private constructor(props: HardwareMetricsProps) {
    this.props = props;
  }

  static create(
    agentId: AgentId,
    tenantId: TenantId,
    cpu: CpuMetrics,
    memory: MemoryMetrics,
    disk: DiskMetrics,
    uptimeSeconds: number,
    osVersion: string,
    hostname: string,
    osBuild?: string
  ): Result<HardwareMetrics, InvalidArgumentError> {
    if (!agentId || !tenantId) {
      return Result.failure(new InvalidArgumentError('HardwareMetrics', 'AgentId and TenantId required'));
    }
    if (uptimeSeconds < 0) {
      return Result.failure(new InvalidArgumentError('HardwareMetrics', 'Uptime must be >= 0'));
    }
    if (!osVersion || !hostname) {
      return Result.failure(new InvalidArgumentError('HardwareMetrics', 'OS version and hostname required'));
    }

    return Result.success(new HardwareMetrics({
      id: crypto.randomUUID(),
      agentId,
      tenantId,
      cpu,
      memory,
      disk,
      uptimeSeconds,
      osVersion,
      hostname,
      osBuild,
      collectedAt: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: HardwareMetricsProps): HardwareMetrics {
    return new HardwareMetrics(props);
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get cpu(): CpuMetrics { return this.props.cpu; }
  get memory(): MemoryMetrics { return this.props.memory; }
  get disk(): DiskMetrics { return this.props.disk; }
  get uptimeSeconds(): number { return this.props.uptimeSeconds; }
  get osVersion(): string { return this.props.osVersion; }
  get hostname(): string { return this.props.hostname; }
  get osBuild(): string | undefined { return this.props.osBuild; }
  get collectedAt(): Date { return this.props.collectedAt; }

  /**
   * Check if any metric is in critical state.
   */
  get hasCriticalMetrics(): boolean {
    return this.props.cpu.isCritical || this.props.memory.isCritical || this.props.disk.isCritical;
  }

  /**
   * Check if any metric is in warning state.
   */
  get hasWarningMetrics(): boolean {
    return this.props.cpu.isWarning || this.props.memory.isWarning || this.props.disk.isWarning;
  }

  /**
   * Overall health score (0-100, higher is better).
   */
  get healthScore(): number {
    const cpuScore = 100 - this.props.cpu.usagePercent;
    const memScore = 100 - this.props.memory.usagePercent;
    const diskScore = 100 - this.props.disk.usagePercent;
    return Math.round((cpuScore * 0.4 + memScore * 0.35 + diskScore * 0.25));
  }
}
