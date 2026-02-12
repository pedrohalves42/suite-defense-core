import type { JobRepository } from '@/application/ports/output/JobRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { JobExecution } from '@/domain/entities/JobExecution';
import { JobCompletedEvent, JobFailedEvent } from '@/domain/events/JobEvents';
import { BusinessRuleViolationError } from '@/domain/shared/DomainError';

export interface ProcessJobResultCommand {
  jobId: string;
  agentId: string;
  executionIndex: number;
  nonce: string;
  payloadHash: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  outputHash: string;
  resultSignature?: string;
}

export interface ProcessJobResultResult {
  jobId: string;
  executionId: string;
  status: string;
  signatureVerified: boolean;
}

/**
 * Use case: Process a job execution result reported by an agent.
 */
export class ProcessJobResult {
  constructor(
    private readonly jobRepo: JobRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(command: ProcessJobResultCommand): Promise<ProcessJobResultResult> {
    const job = await this.jobRepo.findById(command.jobId);
    if (!job) {
      throw new BusinessRuleViolationError(`Job ${command.jobId} not found`);
    }

    // Create execution record
    const execution = JobExecution.start({
      jobId: command.jobId,
      agentId: command.agentId,
      executionIndex: command.executionIndex,
      nonce: command.nonce,
      payloadHash: command.payloadHash,
    });

    // Validate payload integrity (tamper detection)
    if (job.payloadHash && !execution.validatePayloadIntegrity(job.payloadHash)) {
      throw new BusinessRuleViolationError(
        `Payload hash mismatch for job ${command.jobId}: possible tampering`
      );
    }

    // Record the result
    execution.recordResult({
      exitCode: command.exitCode,
      stdout: command.stdout,
      stderr: command.stderr,
      outputHash: command.outputHash,
      resultSignature: command.resultSignature,
    });

    // Transition job status
    if (execution.isSuccess()) {
      job.complete();
      await this.eventDispatcher.dispatch(
        new JobCompletedEvent(job.id, command.agentId, command.exitCode)
      );
    } else {
      job.fail();
      await this.eventDispatcher.dispatch(
        new JobFailedEvent(job.id, command.agentId, command.stderr ?? `Exit code: ${command.exitCode}`)
      );
    }

    // Persist both
    await this.jobRepo.save(job);
    await this.jobRepo.saveExecution(execution);

    return {
      jobId: job.id,
      executionId: execution.id,
      status: job.status,
      signatureVerified: execution.signatureVerified,
    };
  }
}
