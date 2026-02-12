import { Entity } from '../shared/Entity';
import { Result } from '../shared/Result';
import { DomainError } from '../shared/DomainError';
import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { JobId } from '../value-objects/JobId';
import { JobRetryScheduledEvent } from '../events/JobEvents';

// ─── Job Enums ──────────────────────────────────────────
export enum JobType {
  UPDATE_AGENT = 'update_agent',
  RUN_SCRIPT = 'run_script',
  COLLECT_SYSTEM_METRICS = 'collect_system_metrics',
  COLLECT_PROCESS_SNAPSHOT = 'collect_process_snapshot',
  COLLECT_NETWORK_INFO = 'collect_network_info',
  HEALTH_CHECK = 'health_check',
  SECURITY_SCAN = 'security_scan',
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

// ─── Create Props ───────────────────────────────────────
export interface CreateJobProps {
  agentId: AgentId;
  tenantId: TenantId;
  type: JobType;
  payload?: any;
  priority?: number;
  timeoutSeconds?: number;
  maxRetries?: number;
}

/**
 * Job entity (Aggregate Root).
 * Represents a task to be executed by an agent.
 * Tracks lifecycle via FSM with retry, TTL, and timeout support.
 */
export class Job extends Entity<JobId> {
  private _agentId: AgentId;
  private _tenantId: TenantId;
  private _type: JobType;
  private _payload: any;
  private _priority: number;
  private _timeoutSeconds: number;
  private _status: JobStatus;
  private _deliveredAt: Date | null;
  private _startedAt: Date | null;
  private _completedAt: Date | null;
  private _result: any;
  private _error: string | null;
  private _retryCount: number;
  private _maxRetries: number;

  private constructor(
    id: JobId,
    agentId: AgentId,
    tenantId: TenantId,
    type: JobType,
    payload: any,
    priority: number,
    timeoutSeconds: number,
    status: JobStatus,
    retryCount: number,
    maxRetries: number
  ) {
    super(id);
    this._agentId = agentId;
    this._tenantId = tenantId;
    this._type = type;
    this._payload = payload;
    this._priority = priority;
    this._timeoutSeconds = timeoutSeconds;
    this._status = status;
    this._retryCount = retryCount;
    this._maxRetries = maxRetries;
    this._deliveredAt = null;
    this._startedAt = null;
    this._completedAt = null;
    this._result = null;
    this._error = null;
  }

  static create(props: CreateJobProps): Result<Job, DomainError> {
    if (!props.agentId || !props.tenantId) {
      return Result.failure(new DomainError('AgentId and TenantId required'));
    }

    if (!Object.values(JobType).includes(props.type)) {
      return Result.failure(new DomainError('Invalid job type'));
    }

    return Result.success(new Job(
      JobId.generate(),
      props.agentId,
      props.tenantId,
      props.type,
      props.payload || {},
      props.priority || 1,
      props.timeoutSeconds || 300,
      JobStatus.PENDING,
      0,
      props.maxRetries || 3
    ));
  }

  static reconstitute(props: {
    id: string;
    agentId: string;
    tenantId: string;
    type: string;
    payload: any;
    priority: number;
    timeoutSeconds: number;
    status: string;
    retryCount: number;
    maxRetries: number;
    deliveredAt: string | null;
    startedAt: string | null;
    completedAt: string | null;
    result: any;
    error: string | null;
  }): Job {
    const job = new Job(
      JobId.create(props.id).value,
      AgentId.create(props.agentId).value,
      TenantId.create(props.tenantId).value,
      props.type as JobType,
      props.payload,
      props.priority,
      props.timeoutSeconds,
      props.status as JobStatus,
      props.retryCount,
      props.maxRetries
    );
    job._deliveredAt = props.deliveredAt ? new Date(props.deliveredAt) : null;
    job._startedAt = props.startedAt ? new Date(props.startedAt) : null;
    job._completedAt = props.completedAt ? new Date(props.completedAt) : null;
    job._result = props.result;
    job._error = props.error;
    return job;
  }

  // ─── FSM Methods ────────────────────────────────────────

  canBeDelivered(): boolean {
    return this._status === JobStatus.QUEUED;
  }

  deliver(): Result<void, DomainError> {
    if (!this.canBeDelivered()) {
      return Result.failure(new DomainError(`Job ${this.id.value} cannot be delivered from status ${this._status}`));
    }
    this._status = JobStatus.DELIVERED;
    this._deliveredAt = new Date();
    return Result.success(undefined);
  }

  start(): Result<void, DomainError> {
    if (this._status !== JobStatus.DELIVERED) {
      return Result.failure(new DomainError(`Job ${this.id.value} cannot be started from status ${this._status}`));
    }
    this._status = JobStatus.RUNNING;
    this._startedAt = new Date();
    return Result.success(undefined);
  }

  complete(result: any): Result<void, DomainError> {
    if (this._status !== JobStatus.RUNNING) {
      return Result.failure(new DomainError(`Job ${this.id.value} cannot be completed from status ${this._status}`));
    }
    this._status = JobStatus.COMPLETED;
    this._completedAt = new Date();
    this._result = result;
    return Result.success(undefined);
  }

  fail(error: string): Result<void, DomainError> {
    this._error = error;
    this._completedAt = new Date();

    // Check if can retry
    if (this._retryCount < this._maxRetries) {
      this._retryCount++;
      this._status = JobStatus.PENDING; // Will be re-queued
      this.addDomainEvent(new JobRetryScheduledEvent(this.id.value, this._retryCount));
    } else {
      this._status = JobStatus.FAILED;
    }

    return Result.success(undefined);
  }

  timeout(): Result<void, DomainError> {
    if (this._status !== JobStatus.RUNNING) {
      return Result.failure(new DomainError(`Job ${this.id.value} cannot timeout from status ${this._status}`));
    }
    this._status = JobStatus.TIMEOUT;
    this._completedAt = new Date();
    this._error = 'Job timed out';
    return Result.success(undefined);
  }

  cancel(): Result<void, DomainError> {
    if (this.isTerminal()) {
      return Result.failure(new DomainError(`Job ${this.id.value} is already in terminal state`));
    }
    this._status = JobStatus.CANCELLED;
    this._completedAt = new Date();
    return Result.success(undefined);
  }

  queue(): Result<void, DomainError> {
    if (this._status !== JobStatus.PENDING) {
      return Result.failure(new DomainError(`Job ${this.id.value} cannot be queued from status ${this._status}`));
    }
    this._status = JobStatus.QUEUED;
    return Result.success(undefined);
  }

  // ─── Business Logic ─────────────────────────────────────

  isExpired(): boolean {
    if (!this._startedAt || this._status !== JobStatus.RUNNING) return false;
    const timeoutMs = this._timeoutSeconds * 1000;
    const elapsed = Date.now() - this._startedAt.getTime();
    return elapsed > timeoutMs;
  }

  isTerminal(): boolean {
    return [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.TIMEOUT, JobStatus.CANCELLED]
      .includes(this._status);
  }

  // ─── Getters ────────────────────────────────────────────

  get agentId(): AgentId { return this._agentId; }
  get tenantId(): TenantId { return this._tenantId; }
  get type(): JobType { return this._type; }
  get status(): JobStatus { return this._status; }
  get payload(): any { return this._payload; }
  get priority(): number { return this._priority; }
  get timeoutSeconds(): number { return this._timeoutSeconds; }
  get deliveredAt(): Date | null { return this._deliveredAt; }
  get startedAt(): Date | null { return this._startedAt; }
  get completedAt(): Date | null { return this._completedAt; }
  get result(): any { return this._result; }
  get error(): string | null { return this._error; }
  get retryCount(): number { return this._retryCount; }
  get maxRetries(): number { return this._maxRetries; }
}
