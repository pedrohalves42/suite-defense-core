import { BehavioralBaseline, BaselineType } from '@/domain/entities/BehavioralBaseline';
import { AgentId } from '@/domain/value-objects/AgentId';
import { TenantId } from '@/domain/value-objects/TenantId';
import type { Database, Json } from '@/integrations/supabase/types';

type BehavioralBaselineInsert = Database['public']['Tables']['agent_behavioral_baseline']['Insert'];

export class BehavioralBaselineMapper {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static toDomain(row: any): BehavioralBaseline {
    return BehavioralBaseline.reconstitute({
      id: row.id as string,
      agentId: AgentId.create(row.agent_id as string).value,
      tenantId: TenantId.create(row.tenant_id as string).value,
      type: (row.baseline_type as BaselineType) ?? BaselineType.PROCESS_PATTERNS,
      data: (row.baseline_data as Record<string, unknown>) ?? {},
      thresholds: {
        mean: (row.mean_value as number) ?? 0,
        stdDev: (row.std_deviation as number) ?? 0,
        multiplier: (row.threshold_multiplier as number) ?? 2.0,
      },
      periodStart: row.baseline_period_start ? new Date(row.baseline_period_start as string) : undefined,
      periodEnd: row.baseline_period_end ? new Date(row.baseline_period_end as string) : undefined,
      isActive: (row.is_active as boolean) ?? true,
      lastUpdated: new Date(row.last_updated as string),
      createdAt: new Date(row.created_at as string),
    });
  }

  static toPersistence(entity: BehavioralBaseline): BehavioralBaselineInsert {
    return {
      id: entity.id,
      agent_id: entity.agentId.toString(),
      tenant_id: entity.tenantId.toString(),
      baseline_type: entity.type,
      baseline_data: entity.data as Json,
      mean_value: entity.thresholds.mean,
      std_deviation: entity.thresholds.stdDev,
      threshold_multiplier: entity.thresholds.multiplier,
      baseline_period_start: entity.periodStart?.toISOString(),
      baseline_period_end: entity.periodEnd?.toISOString(),
      is_active: entity.isActive,
      last_updated: entity.lastUpdated.toISOString(),
    };
  }
}
