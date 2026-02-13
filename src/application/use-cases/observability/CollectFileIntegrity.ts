import type { FileIntegrityRepository } from '@/application/ports/output/FileIntegrityRepository';
import type { AgentRepository } from '@/application/ports/output/AgentRepository';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';
import { FileIntegrityCheck, type CreateFileIntegrityCheckProps, IntegrityStatus, type ScanType } from '@/domain/entities/FileIntegrityCheck';
import type { AgentId } from '@/domain/value-objects/AgentId';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';

export interface CollectFileIntegrityInput {
  agentId: AgentId;
  scanType: ScanType;
  files: Array<{
    path: string;
    expectedHash: string | null;
    actualHash: string;
    fileSize?: number;
    modifiedAt?: Date;
  }>;
}

export interface CollectFileIntegrityOutput {
  checksProcessed: number;
  violationsFound: number;
}

export class CollectFileIntegrity {
  constructor(
    private readonly fileIntegrityRepo: FileIntegrityRepository,
    private readonly agentRepo: AgentRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: CollectFileIntegrityInput): Promise<Result<CollectFileIntegrityOutput, ApplicationError>> {
    const agent = await this.agentRepo.findById(input.agentId);
    if (!agent) {
      return Result.failure(new ApplicationError('Agent not found', 'AGENT_NOT_FOUND'));
    }

    const checks: FileIntegrityCheck[] = [];
    let violations = 0;

    for (const file of input.files) {
      const result = FileIntegrityCheck.create({
        agentId: input.agentId,
        tenantId: agent.tenantId,
        filePath: file.path,
        expectedHash: file.expectedHash,
        actualHash: file.actualHash,
        scanType: input.scanType,
        fileSize: file.fileSize,
        modifiedAt: file.modifiedAt,
      });

      if (result.isSuccess) {
        const check = result.value;
        checks.push(check);
        if (check.isViolation) violations++;
      }
    }

    if (checks.length > 0) {
      await this.fileIntegrityRepo.saveBatch(checks);
    }

    return Result.success({
      checksProcessed: checks.length,
      violationsFound: violations,
    });
  }
}
