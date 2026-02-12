import { BusinessRuleViolationError } from '../shared/DomainError';

// ─── Execution Props ────────────────────────────────────
export interface JobExecutionProps {
  id: string;
  jobId: string;
  agentId: string;
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
export class JobExecution {
  private props: JobExecutionProps;

  private constructor(props: JobExecutionProps) {
    this.props = props;
  }

  /**
   * Factory: Start a new execution attempt.
   */
  static start(params: {
    jobId: string;
    agentId: string;
    executionIndex: number;
    nonce: string;
    payloadHash: string;
  }): JobExecution {
    return new JobExecution({
      id: crypto.randomUUID(),
      jobId: params.jobId,
      agentId: params.agentId,
      executionIndex: params.executionIndex,
      nonce: params.nonce,
      payloadHash: params.payloadHash,
      startedAt: new Date(),
      completedAt: null,
      exitCode: null,
      stdout: null,
      stderr: null,
      outputHash: null,
      resultSignature: null,
      signatureVerified: false,
      durationMs: null,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: JobExecutionProps): JobExecution {
    return new JobExecution(props);
  }

  // ─── Getters ────────────────────────────────────────────
  get id(): string { return this.props.id; }
  get jobId(): string { return this.props.jobId; }
  get agentId(): string { return this.props.agentId; }
  get executionIndex(): number { return this.props.executionIndex; }
  get nonce(): string { return this.props.nonce; }
  get payloadHash(): string { return this.props.payloadHash; }
  get startedAt(): Date { return this.props.startedAt; }
  get completedAt(): Date | null { return this.props.completedAt; }
  get exitCode(): number | null { return this.props.exitCode; }
  get stdout(): string | null { return this.props.stdout; }
  get stderr(): string | null { return this.props.stderr; }
  get outputHash(): string | null { return this.props.outputHash; }
  get resultSignature(): string | null { return this.props.resultSignature; }
  get signatureVerified(): boolean { return this.props.signatureVerified; }
  get durationMs(): number | null { return this.props.durationMs; }
  get createdAt(): Date { return this.props.createdAt; }

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
    if (this.props.completedAt !== null) {
      throw new BusinessRuleViolationError(
        `Execution ${this.props.id} already has a result recorded (immutable)`
      );
    }

    const now = new Date();
    this.props.completedAt = now;
    this.props.exitCode = params.exitCode;
    this.props.stdout = params.stdout ?? null;
    this.props.stderr = params.stderr ?? null;
    this.props.outputHash = params.outputHash;
    this.props.resultSignature = params.resultSignature ?? null;
    this.props.durationMs = now.getTime() - this.props.startedAt.getTime();
  }

  /**
   * Mark the result signature as verified.
   */
  markSignatureVerified(): void {
    if (!this.props.resultSignature) {
      throw new BusinessRuleViolationError('Cannot verify signature: no signature present');
    }
    this.props.signatureVerified = true;
  }

  /**
   * Validate payload hash matches the job's payload hash (tamper detection).
   */
  validatePayloadIntegrity(expectedHash: string): boolean {
    return this.props.payloadHash === expectedHash;
  }

  /**
   * Check if execution succeeded (exit code 0).
   */
  isSuccess(): boolean {
    return this.props.exitCode === 0;
  }

  /**
   * Check if execution is completed.
   */
  isCompleted(): boolean {
    return this.props.completedAt !== null;
  }
}
