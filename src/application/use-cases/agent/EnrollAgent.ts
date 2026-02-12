import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { Agent, OsType } from '@/domain/entities/Agent';
import { TenantId } from '@/domain/value-objects/TenantId';
import { CryptoService } from '@/domain/services/CryptoService';
import { AgentEnrolledEvent } from '@/domain/events/AgentEvents';
import { BusinessRuleViolationError } from '@/domain/shared/DomainError';

export interface EnrollAgentCommand {
  tenantId: string;
  agentName: string;
  osType: string;
}

export interface EnrollAgentResult {
  agentId: string;
  hmacSecret: string;
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

  async execute(command: EnrollAgentCommand): Promise<EnrollAgentResult> {
    const tenantIdResult = TenantId.create(command.tenantId);
    if (tenantIdResult.isFailure) {
      throw new BusinessRuleViolationError(`Invalid tenant ID: ${command.tenantId}`);
    }

    // Check for duplicate name within tenant
    const existing = await this.agentRepo.findByNameAndTenant(
      command.agentName,
      tenantIdResult.value,
    );
    if (existing) {
      throw new BusinessRuleViolationError(
        `Agent with name "${command.agentName}" already exists in this tenant`
      );
    }

    // Generate HMAC secret
    const hmacSecret = await this.cryptoService.generateAgentSecret();

    // Create agent entity
    const osType = command.osType as OsType;
    const agent = Agent.create({
      tenantId: tenantIdResult.value,
      name: command.agentName,
      osType,
      hmacSecret,
    });

    await this.agentRepo.save(agent);

    await this.eventDispatcher.dispatch(
      new AgentEnrolledEvent(agent.id.value, command.tenantId, command.agentName)
    );

    return {
      agentId: agent.id.value,
      hmacSecret,
    };
  }
}
