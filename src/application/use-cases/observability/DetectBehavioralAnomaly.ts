import type { BehavioralBaselineRepository } from '@/application/ports/output/BehavioralBaselineRepository';
import { BehavioralBaseline, type BaselineType, type AnomalyResult } from '@/domain/entities/BehavioralBaseline';
import type { AgentId } from '@/domain/value-objects/AgentId';
import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';

export interface DetectAnomalyInput {
  agentId: AgentId;
  baselineType: BaselineType;
  currentValue: number;
}

export interface DetectAnomalyOutput {
  result: AnomalyResult;
  baselineId: string;
}

export class DetectBehavioralAnomaly {
  constructor(
    private readonly baselineRepo: BehavioralBaselineRepository,
  ) {}

  async execute(input: DetectAnomalyInput): Promise<Result<DetectAnomalyOutput, ApplicationError>> {
    const baseline = await this.baselineRepo.findByAgentAndType(input.agentId, input.baselineType);

    if (!baseline) {
      return Result.failure(new ApplicationError(
        `No active baseline found for type ${input.baselineType}`,
        'BASELINE_NOT_FOUND',
      ));
    }

    const result = baseline.detectAnomaly(input.currentValue);

    return Result.success({
      result,
      baselineId: baseline.id,
    });
  }
}
