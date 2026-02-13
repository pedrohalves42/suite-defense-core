import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import { PatchOrchestrator, type PatchInfo, type DeploymentConfig } from '@/domain/services/PatchOrchestrator';
import type { PatchDeployment } from '@/domain/entities/PatchDeployment';
import { Job, JobType, JobPriority } from '@/domain/entities/Job';
import type { AgentId } from '@/domain/value-objects/AgentId';
import type { TenantId } from '@/domain/value-objects/TenantId';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';

// ─── Port: Patch Deployment Repository ──────────────────

export interface PatchDeploymentRepository {
  save(deployment: PatchDeployment): Promise<void>;
  findByPatchAndAgent(patchId: string, agentId: string): Promise<PatchDeployment | null>;
}

// ─── Input/Output ───────────────────────────────────────

export interface OrchestratePatchInput {
  patch: PatchInfo;
  targetAgentIds: AgentId[];
  tenantId: TenantId;
  config: DeploymentConfig;
}

export interface OrchestratePatchOutput {
  status: string;
  totalDeployments: number;
  pendingApprovals: number;
  message: string;
}

// ─── Use Case ───────────────────────────────────────────

export class OrchestratePatchDeployment {
  private readonly orchestrator = new PatchOrchestrator();

  constructor(
    private readonly deploymentRepo: PatchDeploymentRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: OrchestratePatchInput): Promise<Result<OrchestratePatchOutput, ApplicationError>> {
    if (input.targetAgentIds.length === 0) {
      return Result.failure(new ApplicationError('No target agents specified'));
    }

    const result = this.orchestrator.orchestrate(
      input.patch,
      input.targetAgentIds,
      input.tenantId,
      input.config,
    );

    // Persist deployments
    for (const deployment of result.deployments) {
      await this.deploymentRepo.save(deployment);

      for (const event of deployment.domainEvents) {
        await this.eventDispatcher.dispatch(event);
      }
      deployment.clearDomainEvents();
    }

    const message =
      result.status === 'deploying'
        ? `Patch deployment started for ${result.totalDeployments} agents`
        : result.status === 'approval_required'
          ? `Approval required for ${result.pendingApprovals} deployments`
          : 'No compatible agents found';

    return Result.success({
      status: result.status,
      totalDeployments: result.totalDeployments,
      pendingApprovals: result.pendingApprovals,
      message,
    });
  }
}
