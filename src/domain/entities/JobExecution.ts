import { Entity } from '../shared/Entity';
import { BusinessRuleViolationError } from '../shared/DomainError';
import { AgentId } from '../value-objects/AgentId';
import { TenantId } from '../value-objects/TenantId';
import { JobId } from '../value-objects/JobId';
import { JobExecutionId } from '../value-objects/JobExecutionId';

// ─── Execution Props ────────────────────────────────────
export interface JobExecutionProps {
  id: string;
  jobId: string;
  agentId: string;
  tenantId: string;
  executionIndex: number;
  nonce: string;
  payloadHash: string;
  startedAt: Date;
  completedAt: Date | null;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
  outputHash: string | null;
  resultSignature: string | null;
  signatureVerified: boolean;
  durationMs: number | null;
  createdAt: Date;
}

/**
 * JobExecution entity.
 * Immutable record of a single execution attempt for a job.
 * Part of the immutable audit trail (ADR: job-execution-immutable-audit-trail).
 */
export class JobExecution extends Entity<JobExecutionId> {
  private _jobId: JobId;
  private _agentId: AgentId;
  private _tenantId: TenantId;
  private _executionIndex: number;
  private _nonce: string;
  private _payloadHash: string;
  private _startedAt: Date;
  private _completedAt: Date | null;
  private _exitCode: number | null;
  private _stdout: string | null;
  private _stderr: string | null;
  private _outputHash: string | null;
  private _resultSignature: string | null;
  private _signatureVerified: boolean;
  private _durationMs: number | null;
  private _createdAt: Date;

  private constructor(
    id: JobExecutionId,
    jobId: JobId,
    agentId: AgentId,
    tenantId: TenantId,
    executionIndex: number,
    nonce: string,
    payloadHash: string,
    startedAt: Date,
    createdAt: Date
  ) {
    super(id);
    this._jobId = jobId;
    this._agentId = agentId;
    this._tenantId = tenantId;
    this._executionIndex = executionIndex;
    this._nonce = nonce;
    this._payloadHash = payloadHash;
    this._startedAt = startedAt;
    this._completedAt = null;
    this._exitCode = null;
    this._stdout = null;
    this._stderr = null;
    this._outputHash = null;
    this._resultSignature = null;
    this._signatureVerified = false;
    this._durationMs = null;
    this._createdAt = createdAt;
  }

  /**
   * Factory: Start a new execution attempt.
   */
  static start(params: {
    jobId: string;
    agentId: string;
    tenantId: string;
    executionIndex: number;
    nonce: string;
    payloadHash: string;
  }): JobExecution {
    return new JobExecution(
      JobExecutionId.generate(),
      JobId.create(params.jobId).value,
      AgentId.create(params.agentId).value,
      TenantId.create(params.tenantId).value,
      params.executionIndex,
      params.nonce,
      params.payloadHash,
      new Date(),
      new Date()
    );
  }

  static reconstitute(props: JobExecutionProps): JobExecution {
    const exec = new JobExecution(
      JobExecutionId.create(props.id).value,
      JobId.create(props.jobId).value,
      AgentId.create(props.agentId).value,
      TenantId.create(props.tenantId).value,
      props.executionIndex,
      props.nonce,
      props.payloadHash,
      props.startedAt,
      props.createdAt
    );
    exec._completedAt = props.completedAt;
    exec._exitCode = props.exitCode;
    exec._stdout = props.stdout;
    exec._stderr = props.stderr;
    exec._outputHash = props.outputHash;
    exec._resultSignature = props.resultSignature;
    exec._signatureVerified = props.signatureVerified;
    exec._durationMs = props.durationMs;
    return exec;
  }

  // ─── Getters ────────────────────────────────────────────
  get jobId(): JobId { return this._jobId; }
  get agentId(): AgentId { return this._agentId; }
  get tenantId(): TenantId { return this._tenantId; }
  get executionIndex(): number { return this._executionIndex; }
  get nonce(): string { return this._nonce; }
  get payloadHash(): string { return this._payloadHash; }
  get startedAt(): Date { return this._startedAt; }
  get completedAt(): Date | null { return this._completedAt; }
  get exitCode(): number | null { return this._exitCode; }
  get stdout(): string | null { return this._stdout; }
  get stderr(): string | null { return this._stderr; }
  get outputHash(): string | null { return this._outputHash; }
  get resultSignature(): string | null { return this._resultSignature; }
  get signatureVerified(): boolean { return this._signatureVerified; }
  get durationMs(): number | null { return this._durationMs; }
  get createdAt(): Date { return this._createdAt; }

  // ─── Business Logic ─────────────────────────────────────

  /**
   * Record the execution result (immutable once set).
   */
  recordResult(params: {
    exitCode: number;
    stdout?: string;
    stderr?: string;
    outputHash: string;
    resultSignature?: string;
  }): void {
    if (this._completedAt !== null) {
      throw new BusinessRuleViolationError(
        `Execution ${this.id.value} already has a result recorded (immutable)`
      );
    }

    const now = new Date();
    this._completedAt = now;
    this._exitCode = params.exitCode;
    this._stdout = params.stdout ?? null;
    this._stderr = params.stderr ?? null;
    this._outputHash = params.outputHash;
    this._resultSignature = params.resultSignature ?? null;
    this._durationMs = now.getTime() - this._startedAt.getTime();
  }

  markSignatureVerified(): void {
    if (!this._resultSignature) {
      throw new BusinessRuleViolationError('Cannot verify signature: no signature present');
    }
    this._signatureVerified = true;
  }

  validatePayloadIntegrity(expectedHash: string): boolean {
    return this._payloadHash === expectedHash;
  }

  isSuccess(): boolean {
    return this._exitCode === 0;
  }

  isCompleted(): boolean {
    return this._completedAt !== null;
  }
}
