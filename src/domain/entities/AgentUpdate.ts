import { AgentId } from '../value-objects/AgentId';
import { UpdatePackageId } from '../value-objects/UpdatePackageId';
import { UpdateStatus } from '../constants';
import { BusinessRuleViolationError } from '../shared/DomainError';

export interface AgentUpdateProps {
  id: string;
  agentId: AgentId;
  packageId: UpdatePackageId;
  status: UpdateStatus;
  downloadStartedAt?: Date | null;
  downloadCompletedAt?: Date | null;
  applyStartedAt?: Date | null;
  applyCompletedAt?: Date | null;
  errorMessage?: string | null;
  rollbackReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_TRANSITIONS: Record<UpdateStatus, UpdateStatus[]> = {
  [UpdateStatus.PENDING]: [UpdateStatus.DOWNLOADING, UpdateStatus.FAILED],
  [UpdateStatus.DOWNLOADING]: [UpdateStatus.APPLYING, UpdateStatus.FAILED],
  [UpdateStatus.APPLYING]: [UpdateStatus.COMPLETED, UpdateStatus.FAILED],
  [UpdateStatus.COMPLETED]: [UpdateStatus.ROLLED_BACK],
  [UpdateStatus.FAILED]: [],
  [UpdateStatus.ROLLED_BACK]: [],
};

/**
 * AgentUpdate entity.
 * Tracks the lifecycle of a single update applied to a specific agent.
 */
export class AgentUpdate {
  private props: AgentUpdateProps;

  private constructor(props: AgentUpdateProps) {
    this.props = props;
  }

  static create(agentId: AgentId, packageId: UpdatePackageId): AgentUpdate {
    return new AgentUpdate({
      id: crypto.randomUUID(),
      agentId,
      packageId,
      status: UpdateStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  static reconstitute(props: AgentUpdateProps): AgentUpdate {
    return new AgentUpdate(props);
  }

  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get packageId(): UpdatePackageId { return this.props.packageId; }
  get status(): UpdateStatus { return this.props.status; }
  get errorMessage(): string | null | undefined { return this.props.errorMessage; }
  get rollbackReason(): string | null | undefined { return this.props.rollbackReason; }
  get downloadStartedAt(): Date | null | undefined { return this.props.downloadStartedAt; }
  get downloadCompletedAt(): Date | null | undefined { return this.props.downloadCompletedAt; }
  get applyStartedAt(): Date | null | undefined { return this.props.applyStartedAt; }
  get applyCompletedAt(): Date | null | undefined { return this.props.applyCompletedAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  private transitionTo(newStatus: UpdateStatus): void {
    const allowed = VALID_TRANSITIONS[this.props.status];
    if (!allowed.includes(newStatus)) {
      throw new BusinessRuleViolationError(
        `Cannot transition from ${this.props.status} to ${newStatus}`
      );
    }
    this.props.status = newStatus;
    this.props.updatedAt = new Date();
  }

  startDownload(): void {
    this.transitionTo(UpdateStatus.DOWNLOADING);
    this.props.downloadStartedAt = new Date();
  }

  completeDownload(): void {
    this.props.downloadCompletedAt = new Date();
  }

  startApply(): void {
    this.transitionTo(UpdateStatus.APPLYING);
    this.props.applyStartedAt = new Date();
  }

  complete(): void {
    this.transitionTo(UpdateStatus.COMPLETED);
    this.props.applyCompletedAt = new Date();
  }

  fail(errorMessage: string): void {
    this.transitionTo(UpdateStatus.FAILED);
    this.props.errorMessage = errorMessage;
  }

  rollback(reason: string): void {
    this.transitionTo(UpdateStatus.ROLLED_BACK);
    this.props.rollbackReason = reason;
  }

  isTerminal(): boolean {
    return [UpdateStatus.COMPLETED, UpdateStatus.FAILED, UpdateStatus.ROLLED_BACK].includes(this.props.status);
  }
}
