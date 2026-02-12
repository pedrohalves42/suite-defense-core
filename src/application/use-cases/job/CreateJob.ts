import type { JobRepository } from '@/application/ports/output/JobRepository';
import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { Job, JobType } from '@/domain/entities/Job';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';
import { AgentState } from '@/domain/entities/Agent';
import { JobCreatedEvent } from '@/domain/events/JobEvents';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';

export interface CreateJobCommand {
  agentId: string;
  tenantId: string;
  type: string;
  payload?: any;
  priority?: number;
  timeoutSeconds?: number;
  maxRetries?: number;
}

export interface CreateJobResult {
  jobId: string;
  status: string;
  priority: number;
}

/**
 * Use case: Create and queue a new job for an agent.
 */
export class CreateJob {
  constructor(
    private readonly jobRepo: JobRepository,
    private readonly agentRepo: AgentRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(command: CreateJobCommand): Promise<Result<CreateJobResult, ApplicationError>> {
    const agentIdResult = AgentId.create(command.agentId);
    if (agentIdResult.isFailure) {
      return Result.failure(new ApplicationError(`Invalid agent ID: ${command.agentId}`));
    }

    const tenantIdResult = TenantId.create(command.tenantId);
    if (tenantIdResult.isFailure) {
      return Result.failure(new ApplicationError(`Invalid tenant ID: ${command.tenantId}`));
    }

    // Validate agent exists and is active
    const agent = await this.agentRepo.findById(agentIdResult.value);
    if (!agent) {
      return Result.failure(new ApplicationError('Agent not found'));
    }
    if (agent.state !== AgentState.ACTIVE) {
      return Result.failure(new ApplicationError(`Agent is not active (state: ${agent.state})`));
    }

    const jobType = command.type as JobType;

    const jobResult = Job.create({
      agentId: agentIdResult.value,
      tenantId: tenantIdResult.value,
      type: jobType,
      payload: command.payload,
      priority: command.priority,
      timeoutSeconds: command.timeoutSeconds,
      maxRetries: command.maxRetries,
    });

    if (jobResult.isFailure) {
      return Result.failure(new ApplicationError(jobResult.error.message));
    }

    const job = jobResult.value;

    // Auto-queue
    job.queue();

    await this.jobRepo.save(job);

    await this.eventDispatcher.dispatch(
      new JobCreatedEvent(job.id.value, command.agentId, command.type, command.payload)
    );

    return Result.success({
      jobId: job.id.value,
      status: job.status,
      priority: job.priority,
    });
  }
}
