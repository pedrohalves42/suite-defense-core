import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import { ComplianceScoreCalculator, type ComplianceInput, type ComplianceResult } from '@/domain/services/ComplianceScoreCalculator';
import { ComplianceDriftDetector, type ComplianceSnapshot } from '@/domain/services/ComplianceDriftDetector';
import { ComplianceScore } from '@/domain/entities/ComplianceScore';
import type { TenantId } from '@/domain/value-objects/TenantId';
import type { DomainEventDispatcher } from '@/application/ports/output/DomainEventDispatcher';

// ─── Port ───────────────────────────────────────────────

export interface ComplianceScoreRepository {
  getLatest(tenantId: string): Promise<ComplianceSnapshot | null>;
  save(snapshot: ComplianceSnapshot): Promise<void>;
}

// ─── Input/Output ───────────────────────────────────────

export interface CalculateComplianceInput {
  tenantId: TenantId;
  metrics: ComplianceInput;
}

export interface CalculateComplianceOutput {
  result: ComplianceResult;
  hasDrift: boolean;
  trend: string;
  alertSeverity: string;
}

// ─── Use Case ───────────────────────────────────────────

export class CalculateComplianceScoreUseCase {
  private readonly calculator = new ComplianceScoreCalculator();
  private readonly driftDetector = new ComplianceDriftDetector();

  constructor(
    private readonly complianceRepo: ComplianceScoreRepository,
    private readonly eventDispatcher: DomainEventDispatcher,
  ) {}

  async execute(input: CalculateComplianceInput): Promise<Result<CalculateComplianceOutput, ApplicationError>> {
    // Calculate current score
    const result = this.calculator.calculate(input.metrics);

    // Load previous snapshot for drift detection
    const previous = await this.complianceRepo.getLatest(input.tenantId.value);

    const current: ComplianceSnapshot = {
      tenantId: input.tenantId.value,
      overallScore: result.overallScore,
      grade: result.grade,
      calculatedAt: result.calculatedAt,
    };

    // Detect drift
    const driftResult = this.driftDetector.detect(current, previous);

    // Create domain entity with drift info
    const scoreEntity = ComplianceScore.fromCalculation(
      input.tenantId,
      result.overallScore,
      result.grade,
      previous?.overallScore ?? null,
    );

    // Dispatch domain events (e.g. ComplianceScoreChangedEvent)
    for (const event of scoreEntity.domainEvents) {
      await this.eventDispatcher.dispatch(event);
    }
    scoreEntity.clearDomainEvents();

    // Persist snapshot
    await this.complianceRepo.save(current);

    return Result.success({
      result,
      hasDrift: driftResult.hasDrift,
      trend: driftResult.trend,
      alertSeverity: driftResult.alertSeverity,
    });
  }
}
