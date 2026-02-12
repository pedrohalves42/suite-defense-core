import type { JobRepository } from '@/application/ports/output/JobRepository';
import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { Job, JobType, JobPriority } from '@/domain/entities/Job';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';
import { JobCreatedEvent } from '@/domain/events/JobEvents';
import { BusinessRuleViolationError } from '@/domain/shared/DomainError';

export interface CreateJobCommand {
  agentId: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  priority?: number;
}

export interface CreateJobResult {
  jobId: string;
  status: string;
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

  async execute(command: CreateJobCommand): Promise<CreateJobResult> {
    const agentIdResult = AgentId.create(command.agentId);
    if (agentIdResult.isFailure) {
      throw new BusinessRuleViolationError(`Invalid agent ID: ${command.agentId}`);
    }

    const tenantIdResult = TenantId.create(command.tenantId);
    if (tenantIdResult.isFailure) {
      throw new BusinessRuleViolationError(`Invalid tenant ID: ${command.tenantId}`);
    }

    // Validate agent exists and is active
    const agent = await this.agentRepo.findById(agentIdResult.value);
    if (!agent) {
      throw new BusinessRuleViolationError(`Agent ${command.agentId} not found`);
    }
    if (agent.isTerminal()) {
      throw new BusinessRuleViolationError(`Agent ${command.agentId} is decommissioned`);
    }

    const jobType = command.type as JobType;
    const priority = (command.priority ?? JobPriority.NORMAL) as JobPriority;

    const job = Job.create({
      agentId: agentIdResult.value,
      agentName: agent.name,
      tenantId: tenantIdResult.value,
      type: jobType,
      payload: command.payload,
      priority,
    });

    // Auto-approve and queue
    job.approve();

    await this.jobRepo.save(job);

    await this.eventDispatcher.dispatch(
      new JobCreatedEvent(job.id, command.agentId, command.type)
    );

    return {
      jobId: job.id,
      status: job.status,
    };
  }
}
