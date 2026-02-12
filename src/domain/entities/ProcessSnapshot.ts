import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { Result } from '../shared/Result';
import { InvalidArgumentError } from '../shared/DomainError';

export interface ProcessEntry {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMb: number;
  user: string;
  commandLine?: string;
  startTime?: Date;
}

export interface ServiceEntry {
  name: string;
  displayName: string;
  status: 'Running' | 'Stopped' | 'Paused' | 'StartPending' | 'StopPending' | string;
  startupType: 'Automatic' | 'Manual' | 'Disabled' | string;
  description?: string;
}

export interface ProcessSnapshotProps {
  id: string;
  agentId: AgentId;
  tenantId: TenantId;
  processes: ProcessEntry[];
  services: ServiceEntry[];
  totalProcesses: number;
  totalServices: number;
  servicesRunning: number;
  servicesStopped: number;
  newProcesses: ProcessEntry[];
  suspiciousProcesses: ProcessEntry[];
  collectedAt: Date;
  createdAt: Date;
}

/**
 * ProcessSnapshot entity.
 * Represents a point-in-time snapshot of processes and services on an agent.
 */
export class ProcessSnapshot {
  private props: ProcessSnapshotProps;

  private constructor(props: ProcessSnapshotProps) {
    this.props = props;
  }

  static create(
    agentId: AgentId,
    tenantId: TenantId,
    processes: ProcessEntry[],
    services: ServiceEntry[]
  ): Result<ProcessSnapshot, InvalidArgumentError> {
    if (!agentId || !tenantId) {
      return Result.failure(new InvalidArgumentError('ProcessSnapshot', 'AgentId and TenantId are required'));
    }

    const servicesRunning = services.filter(s => s.status === 'Running').length;
    const servicesStopped = services.filter(s => s.status === 'Stopped').length;

    return Result.success(new ProcessSnapshot({
      id: crypto.randomUUID(),
      agentId,
      tenantId,
      processes,
      services,
      totalProcesses: processes.length,
      totalServices: services.length,
      servicesRunning,
      servicesStopped,
      newProcesses: [],
      suspiciousProcesses: [],
      collectedAt: new Date(),
      createdAt: new Date(),
    }));
  }

  static reconstitute(props: ProcessSnapshotProps): ProcessSnapshot {
    return new ProcessSnapshot(props);
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get processes(): ProcessEntry[] { return this.props.processes; }
  get services(): ServiceEntry[] { return this.props.services; }
  get totalProcesses(): number { return this.props.totalProcesses; }
  get totalServices(): number { return this.props.totalServices; }
  get servicesRunning(): number { return this.props.servicesRunning; }
  get servicesStopped(): number { return this.props.servicesStopped; }
  get newProcesses(): ProcessEntry[] { return this.props.newProcesses; }
  get suspiciousProcesses(): ProcessEntry[] { return this.props.suspiciousProcesses; }
  get collectedAt(): Date { return this.props.collectedAt; }

  /**
   * Detect new processes by comparing with a previous snapshot.
   */
  detectNewProcesses(previousSnapshot: ProcessSnapshot): void {
    const previousNames = new Set(previousSnapshot.processes.map(p => p.name.toLowerCase()));
    this.props.newProcesses = this.props.processes.filter(
      p => !previousNames.has(p.name.toLowerCase())
    );
  }

  /**
   * Flag suspicious processes based on heuristics.
   */
  detectSuspiciousProcesses(suspiciousPaths: string[]): void {
    this.props.suspiciousProcesses = this.props.processes.filter(p =>
      p.commandLine && suspiciousPaths.some(sp =>
        p.commandLine!.toLowerCase().includes(sp.toLowerCase())
      )
    );
  }

  get hasSuspiciousActivity(): boolean {
    return this.props.suspiciousProcesses.length > 0;
  }

  get hasNewProcesses(): boolean {
    return this.props.newProcesses.length > 0;
  }
}
