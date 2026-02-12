import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { Agent } from '@/domain/entities/Agent';
import { TenantId } from '@/domain/value-objects/TenantId';
import { CryptoService } from '@/domain/services/CryptoService';
import { AgentEnrolledEvent } from '@/domain/events/AgentEvents';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';

export interface EnrollAgentCommand {
  tenantId: string;
  agentName: string;
  osType: string;
  version?: string;
}

export interface EnrollAgentResult {
  agentId: string;
  agentName: string;
  token: string;
  hmacSecret: string;
  state: string;
  status: string;
}

/**
 * Use case: Enroll a new agent into the system.
 */
export class EnrollAgent {
  constructor(
    private readonly agentRepo: AgentRepository,
    private readonly cryptoService: CryptoService,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(command: EnrollAgentCommand): Promise<Result<EnrollAgentResult, ApplicationError>> {
    const tenantIdResult = TenantId.create(command.tenantId);
    if (tenantIdResult.isFailure) {
      return Result.failure(new ApplicationError('Invalid tenant ID'));
    }

    // Check for duplicate name within tenant
    const existing = await this.agentRepo.findByNameAndTenant(
      command.agentName,
      tenantIdResult.value,
    );
    if (existing) {
      return Result.failure(new ApplicationError('Agent name already exists in tenant'));
    }

    // Generate credentials
    const credentials = await this.cryptoService.generateAgentCredentials();

    // Create agent entity
    const agentResult = Agent.create({
      tenantId: tenantIdResult.value,
      name: command.agentName,
      osType: command.osType,
    });

    if (agentResult.isFailure) {
      return Result.failure(new ApplicationError(agentResult.error.message));
    }

    const agent = agentResult.value;
    await this.agentRepo.save(agent);

    // Publish domain event
    await this.eventDispatcher.dispatch(
      new AgentEnrolledEvent(
        agent.id.value,
        command.tenantId,
        agent.name,
        credentials.token,
        agent.hmacSecret.value
      )
    );

    return Result.success({
      agentId: agent.id.value,
      agentName: agent.name,
      token: credentials.token,
      hmacSecret: agent.hmacSecret.value,
      state: agent.state,
      status: agent.status,
    });
  }
}
