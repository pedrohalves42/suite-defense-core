import { Entity } from '../shared/Entity';
import { ValueObject } from '../shared/ValueObject';
import { Result } from '../shared/Result';
import { DomainError } from '../shared/DomainError';
import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';

// ─── Enums ──────────────────────────────────────────────

export enum PatchDeploymentStatus {
  PENDING = 'pending',
  SCHEDULED = 'scheduled',
  DEPLOYING = 'deploying',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

export enum DeploymentType {
  STANDARD = 'standard',
  ROLLING = 'rolling',
  CANARY = 'canary',
  IMMEDIATE = 'immediate',
}

export enum DeploymentPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ValidationStatus {
  PENDING = 'pending',
  PASSED = 'passed',
  FAILED = 'failed',
}

// ─── Value Object ───────────────────────────────────────

export class PatchDeploymentId extends ValueObject<string> {
  static generate(): PatchDeploymentId {
    return new PatchDeploymentId(crypto.randomUUID());
  }

  static create(value: string): Result<PatchDeploymentId, DomainError> {
    if (!value) return Result.failure(new DomainError('PatchDeploymentId cannot be empty'));
    return Result.success(new PatchDeploymentId(value));
  }
}

// ─── Create Props ───────────────────────────────────────

export interface CreatePatchDeploymentProps {
  patchId: string;
  patchName: string;
  patchVersion: string;
  agentId: AgentId;
  tenantId: TenantId;
  deploymentType?: DeploymentType;
  priority?: DeploymentPriority;
  scheduledFor?: Date;
}

// ─── Entity ─────────────────────────────────────────────

export class PatchDeployment extends Entity<PatchDeploymentId> {
  private _patchId: string;
  private _patchName: string;
  private _patchVersion: string;
  private _agentId: AgentId;
  private _tenantId: TenantId;
  private _status: PatchDeploymentStatus;
  private _deploymentType: DeploymentType;
  private _priority: DeploymentPriority;
  private _scheduledFor: Date | null;
  private _deployedAt: Date | null;
  private _completedAt: Date | null;
  private _rollbackAvailable: boolean;
  private _validationStatus: ValidationStatus;
  private _error: string | null;
  private _createdAt: Date;

  private constructor(
    id: PatchDeploymentId,
    props: {
      patchId: string;
      patchName: string;
      patchVersion: string;
      agentId: AgentId;
      tenantId: TenantId;
      status: PatchDeploymentStatus;
      deploymentType: DeploymentType;
      priority: DeploymentPriority;
      scheduledFor: Date | null;
      deployedAt: Date | null;
      completedAt: Date | null;
      rollbackAvailable: boolean;
      validationStatus: ValidationStatus;
      error: string | null;
      createdAt: Date;
    },
  ) {
    super(id);
    this._patchId = props.patchId;
    this._patchName = props.patchName;
    this._patchVersion = props.patchVersion;
    this._agentId = props.agentId;
    this._tenantId = props.tenantId;
    this._status = props.status;
    this._deploymentType = props.deploymentType;
    this._priority = props.priority;
    this._scheduledFor = props.scheduledFor;
    this._deployedAt = props.deployedAt;
    this._completedAt = props.completedAt;
    this._rollbackAvailable = props.rollbackAvailable;
    this._validationStatus = props.validationStatus;
    this._error = props.error;
    this._createdAt = props.createdAt;
  }

  static create(props: CreatePatchDeploymentProps): Result<PatchDeployment, DomainError> {
    if (!props.patchId || !props.agentId) {
      return Result.failure(new DomainError('PatchId and AgentId are required'));
    }

    return Result.success(new PatchDeployment(
      PatchDeploymentId.generate(),
      {
        patchId: props.patchId,
        patchName: props.patchName,
        patchVersion: props.patchVersion,
        agentId: props.agentId,
        tenantId: props.tenantId,
        status: PatchDeploymentStatus.PENDING,
        deploymentType: props.deploymentType ?? DeploymentType.STANDARD,
        priority: props.priority ?? DeploymentPriority.MEDIUM,
        scheduledFor: props.scheduledFor ?? null,
        deployedAt: null,
        completedAt: null,
        rollbackAvailable: false,
        validationStatus: ValidationStatus.PENDING,
        error: null,
        createdAt: new Date(),
      },
    ));
  }

  // ─── FSM ──────────────────────────────────────────────

  canDeploy(): boolean {
    return this._status === PatchDeploymentStatus.PENDING ||
           this._status === PatchDeploymentStatus.SCHEDULED;
  }

  startDeployment(): Result<void, DomainError> {
    if (!this.canDeploy()) {
      return Result.failure(new DomainError(`Cannot deploy from status ${this._status}`));
    }
    this._status = PatchDeploymentStatus.DEPLOYING;
    this._deployedAt = new Date();
    return Result.success(undefined);
  }

  completeDeployment(rollbackAvailable: boolean = false): void {
    this._status = PatchDeploymentStatus.COMPLETED;
    this._completedAt = new Date();
    this._rollbackAvailable = rollbackAvailable;
  }

  failDeployment(error: string): void {
    this._status = PatchDeploymentStatus.FAILED;
    this._completedAt = new Date();
    this._error = error;
  }

  rollback(): Result<void, DomainError> {
    if (!this._rollbackAvailable || this._status !== PatchDeploymentStatus.COMPLETED) {
      return Result.failure(new DomainError('Rollback not available'));
    }
    this._status = PatchDeploymentStatus.ROLLED_BACK;
    return Result.success(undefined);
  }

  scheduleFor(date: Date): Result<void, DomainError> {
    if (date <= new Date()) {
      return Result.failure(new DomainError('Schedule date must be in the future'));
    }
    this._status = PatchDeploymentStatus.SCHEDULED;
    this._scheduledFor = date;
    return Result.success(undefined);
  }

  validateDeployment(passed: boolean): void {
    this._validationStatus = passed ? ValidationStatus.PASSED : ValidationStatus.FAILED;
  }

  // ─── Getters ──────────────────────────────────────────

  get patchId(): string { return this._patchId; }
  get patchName(): string { return this._patchName; }
  get patchVersion(): string { return this._patchVersion; }
  get agentId(): AgentId { return this._agentId; }
  get tenantId(): TenantId { return this._tenantId; }
  get status(): PatchDeploymentStatus { return this._status; }
  get deploymentType(): DeploymentType { return this._deploymentType; }
  get priority(): DeploymentPriority { return this._priority; }
  get scheduledFor(): Date | null { return this._scheduledFor; }
  get deployedAt(): Date | null { return this._deployedAt; }
  get completedAt(): Date | null { return this._completedAt; }
  get rollbackAvailable(): boolean { return this._rollbackAvailable; }
  get validationStatus(): ValidationStatus { return this._validationStatus; }
  get error(): string | null { return this._error; }
  get createdAt(): Date { return this._createdAt; }
}
