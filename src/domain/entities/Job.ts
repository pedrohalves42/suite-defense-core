import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { BusinessRuleViolationError } from '../shared/DomainError';

// ─── Job Enums ──────────────────────────────────────────
export enum JobType {
  UPDATE_AGENT = 'update_agent',
  RUN_SCRIPT = 'run_script',
  COLLECT_METRICS = 'collect_metrics',
  SCAN_VULNERABILITY = 'scan_vulnerability',
  RESTART_SERVICE = 'restart_service',
  REMEDIATE = 'remediate',
}

export enum JobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  DELIVERED = 'delivered',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  TIMEOUT = 'timeout',
  CANCELLED = 'cancelled',
}

export enum JobPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

// ─── FSM Transition Table ───────────────────────────────
const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.PENDING]: [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.QUEUED]: [JobStatus.DELIVERED, JobStatus.TIMEOUT, JobStatus.CANCELLED],
  [JobStatus.DELIVERED]: [JobStatus.RUNNING, JobStatus.TIMEOUT, JobStatus.CANCELLED],
  [JobStatus.RUNNING]: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.TIMEOUT],
  [JobStatus.COMPLETED]: [],
  [JobStatus.FAILED]: [],
  [JobStatus.TIMEOUT]: [],
  [JobStatus.CANCELLED]: [],
};

// ─── Default TTL ────────────────────────────────────────
const DEFAULT_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const MAX_RETRIES = 3;

// ─── Job Props ──────────────────────────────────────────
export interface JobProps {
  id: string;
  agentId: AgentId;
  agentName: string;
  tenantId: TenantId;
  type: JobType;
  status: JobStatus;
  priority: JobPriority;
  payload: Record<string, unknown>;
  payloadHash: string | null;
  approved: boolean;
  retryCount: number;
  maxRetries: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Job entity (Aggregate Root).
 * Represents a task to be executed by an agent.
 * Tracks lifecycle via FSM with retry and TTL support.
 */
export class Job {
  private props: JobProps;

  private constructor(props: JobProps) {
    this.props = props;
  }

  /**
   * Factory: Create a new job.
   */
  static create(params: {
    agentId: AgentId;
    agentName: string;
    tenantId: TenantId;
    type: JobType;
    payload: Record<string, unknown>;
    priority?: JobPriority;
    ttlMs?: number;
    maxRetries?: number;
  }): Job {
    const now = new Date();
    const ttl = params.ttlMs ?? DEFAULT_TTL_MS;

    return new Job({
      id: crypto.randomUUID(),
      agentId: params.agentId,
      agentName: params.agentName,
      tenantId: params.tenantId,
      type: params.type,
      status: JobStatus.PENDING,
      priority: params.priority ?? JobPriority.NORMAL,
      payload: params.payload,
      payloadHash: null,
      approved: false,
      retryCount: 0,
      maxRetries: params.maxRetries ?? MAX_RETRIES,
      expiresAt: new Date(now.getTime() + ttl),
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: JobProps): Job {
    return new Job(props);
  }

  // ─── Getters ────────────────────────────────────────────
  get id(): string { return this.props.id; }
  get agentId(): AgentId { return this.props.agentId; }
  get agentName(): string { return this.props.agentName; }
  get tenantId(): TenantId { return this.props.tenantId; }
  get type(): JobType { return this.props.type; }
  get status(): JobStatus { return this.props.status; }
  get priority(): JobPriority { return this.props.priority; }
  get payload(): Record<string, unknown> { return this.props.payload; }
  get payloadHash(): string | null { return this.props.payloadHash; }
  get approved(): boolean { return this.props.approved; }
  get retryCount(): number { return this.props.retryCount; }
  get maxRetries(): number { return this.props.maxRetries; }
  get expiresAt(): Date { return this.props.expiresAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  // ─── FSM Methods ────────────────────────────────────────

  canTransitionTo(newStatus: JobStatus): boolean {
    return JOB_TRANSITIONS[this.props.status].includes(newStatus);
  }

  private transitionTo(newStatus: JobStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new BusinessRuleViolationError(
        `Cannot transition job from ${this.props.status} to ${newStatus}`
      );
    }
    this.props.status = newStatus;
    this.props.updatedAt = new Date();
  }

  /**
   * Approve and queue the job for delivery.
   */
  approve(): void {
    this.props.approved = true;
    this.transitionTo(JobStatus.QUEUED);
  }

  /**
   * Mark the job as delivered to the agent.
   */
  markDelivered(): void {
    this.transitionTo(JobStatus.DELIVERED);
  }

  /**
   * Mark the job as running (agent started execution).
   */
  markRunning(): void {
    this.transitionTo(JobStatus.RUNNING);
  }

  /**
   * Mark the job as completed successfully.
   */
  complete(): void {
    this.transitionTo(JobStatus.COMPLETED);
  }

  /**
   * Mark the job as failed.
   */
  fail(): void {
    this.transitionTo(JobStatus.FAILED);
  }

  /**
   * Mark the job as timed out.
   */
  timeout(): void {
    this.transitionTo(JobStatus.TIMEOUT);
  }

  /**
   * Cancel the job.
   */
  cancel(): void {
    this.transitionTo(JobStatus.CANCELLED);
  }

  // ─── Business Logic ─────────────────────────────────────

  /**
   * Check if the job has expired based on TTL.
   */
  isExpired(now: Date = new Date()): boolean {
    return now.getTime() > this.props.expiresAt.getTime();
  }

  /**
   * Check if the job can be retried.
   */
  canRetry(): boolean {
    return this.props.retryCount < this.props.maxRetries
      && (this.props.status === JobStatus.FAILED || this.props.status === JobStatus.TIMEOUT);
  }

  /**
   * Increment retry and reset to queued.
   */
  retry(): void {
    if (!this.canRetry()) {
      throw new BusinessRuleViolationError(
        `Job ${this.props.id} cannot be retried (retries: ${this.props.retryCount}/${this.props.maxRetries})`
      );
    }
    this.props.retryCount += 1;
    this.props.status = JobStatus.QUEUED;
    this.props.updatedAt = new Date();
  }

  /**
   * Set the payload hash for integrity verification.
   */
  setPayloadHash(hash: string): void {
    this.props.payloadHash = hash;
    this.props.updatedAt = new Date();
  }

  /**
   * Check if the job is in a terminal state.
   */
  isTerminal(): boolean {
    return [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.TIMEOUT, JobStatus.CANCELLED]
      .includes(this.props.status);
  }
}
