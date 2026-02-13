import type { VulnerabilityRepository } from '@/application/ports/output/VulnerabilityRepository';
import type { JobRepository } from '@/application/ports/output/JobRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { VulnerabilityScan } from '@/domain/entities/VulnerabilityScan';
import { JobType, JobPriority } from '@/domain/entities/Job';
import type { AgentId } from '@/domain/value-objects/AgentId';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';

export interface AutoRemediateInput {
  agentId: AgentId;
  requireApproval?: boolean;
}

export interface AutoRemediateOutput {
  remediatedCount: number;
  pendingApprovalCount: number;
  failedCount: number;
  remediatedCVEs: string[];
}

export class AutoRemediateVulnerabilities {
  constructor(
    private readonly vulnRepo: VulnerabilityRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: AutoRemediateInput): Promise<Result<AutoRemediateOutput, ApplicationError>> {
    const vulns = await this.vulnRepo.findCriticalUnremediated(input.agentId);

    const remediated: string[] = [];
    let failed = 0;

    for (const vuln of vulns) {
      if (vuln.canAutoRemediate()) {
        try {
          vuln.markRemediated('auto_patch');
          await this.vulnRepo.save(vuln);

          // Dispatch domain events
          for (const event of vuln.domainEvents) {
            await this.eventDispatcher.dispatch(event);
          }
          vuln.clearDomainEvents();

          remediated.push(vuln.cveId);
        } catch {
          vuln.markFailed('auto_remediation_error');
          await this.vulnRepo.save(vuln);
          failed++;
        }
      }
    }

    return Result.success({
      remediatedCount: remediated.length,
      pendingApprovalCount: 0,
      failedCount: failed,
      remediatedCVEs: remediated,
    });
  }
}
