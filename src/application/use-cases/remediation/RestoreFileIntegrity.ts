import type { FileIntegrityRepository } from '@/application/ports/output/FileIntegrityRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { IntegrityStatus, type ScanType, FileIntegritySeverity } from '@/domain/entities/FileIntegrityCheck';
import type { AgentId } from '@/domain/value-objects/AgentId';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import { FileIntegrityRestoredEvent } from '@/domain/events/SecurityEvents';

export interface RestoreFileIntegrityInput {
  agentId: AgentId;
  severityThreshold: FileIntegritySeverity;
}

export interface RestoreFileIntegrityOutput {
  violationsFound: number;
  restoreJobsCreated: number;
  filePaths: string[];
}

/**
 * Identifies file integrity violations and prepares evidence
 * for restore actions. Actual file restoration is delegated to
 * the job engine (agent executes the restore script).
 */
export class RestoreFileIntegrity {
  constructor(
    private readonly fileIntegrityRepo: FileIntegrityRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: RestoreFileIntegrityInput): Promise<Result<RestoreFileIntegrityOutput, ApplicationError>> {
    const checks = await this.fileIntegrityRepo.findByAgent(input.agentId);

    // Filter by violations at or above severity threshold
    const severityOrder: FileIntegritySeverity[] = [
      FileIntegritySeverity.INFO,
      FileIntegritySeverity.LOW,
      FileIntegritySeverity.MEDIUM,
      FileIntegritySeverity.HIGH,
      FileIntegritySeverity.CRITICAL,
    ];
    const thresholdIndex = severityOrder.indexOf(input.severityThreshold);

    const violations = checks.filter(check => {
      if (!check.isViolation) return false;
      const checkIndex = severityOrder.indexOf(check.severity);
      return checkIndex >= thresholdIndex;
    });

    const filePaths: string[] = [];

    for (const violation of violations) {
      filePaths.push(violation.filePath);

      await this.eventDispatcher.dispatch(
        new FileIntegrityRestoredEvent(
          violation.id,
          violation.agentId.value,
          violation.filePath,
          'job_scheduled',
        ),
      );
    }

    return Result.success({
      violationsFound: violations.length,
      restoreJobsCreated: violations.length,
      filePaths,
    });
  }
}
