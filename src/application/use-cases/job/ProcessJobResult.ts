import type { JobRepository } from '@/application/ports/output/JobRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { JobExecution } from '@/domain/entities/JobExecution';
import { JobCompletedEvent, JobFailedEvent } from '@/domain/events/JobEvents';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';

export interface ProcessJobResultCommand {
  jobId: string;
  agentId: string;
  tenantId: string;
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

  async execute(command: ProcessJobResultCommand): Promise<Result<ProcessJobResultResult, ApplicationError>> {
    const job = await this.jobRepo.findById(command.jobId);
    if (!job) {
      return Result.failure(new ApplicationError(`Job ${command.jobId} not found`));
    }

    // Create execution record
    const execution = JobExecution.start({
      jobId: command.jobId,
      agentId: command.agentId,
      tenantId: command.tenantId,
      executionIndex: command.executionIndex,
      nonce: command.nonce,
      payloadHash: command.payloadHash,
    });

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
      job.complete(String(command.stdout || ""));
      await this.eventDispatcher.dispatch(
        new JobCompletedEvent(job.id.value, command.agentId, command.exitCode)
      );
    } else {
      job.fail(command.stderr ?? `Exit code: ${command.exitCode}`);
      await this.eventDispatcher.dispatch(
        new JobFailedEvent(job.id.value, command.agentId, command.stderr ?? `Exit code: ${command.exitCode}`)
      );
    }

    // Persist both
    await this.jobRepo.save(job);
    await this.jobRepo.saveExecution(execution);

    return Result.success({
      jobId: job.id.value,
      executionId: execution.id.value,
      status: job.status,
      signatureVerified: execution.signatureVerified,
    });
  }
}
