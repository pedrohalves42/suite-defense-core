import { Result } from '@/domain/shared/Result';
import { ApplicationError } from '@/domain/shared/ApplicationError';
import type { TenantId } from '@/domain/value-objects/TenantId';

// ─── Types ──────────────────────────────────────────────

export interface MaintenanceTaskResult {
  operation: string;
  success: boolean;
  processedCount: number;
  message: string;
  error?: string;
  durationMs: number;
}

export interface ComprehensiveMaintenanceInput {
  tenantId: TenantId;
  operations: MaintenanceOperation[];
}

export interface ComprehensiveMaintenanceOutput {
  totalOperations: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  results: MaintenanceTaskResult[];
}

export enum MaintenanceOperation {
  CLEANUP_EXPIRED_JOBS = 'cleanup_expired_jobs',
  ARCHIVE_OFFLINE_AGENTS = 'archive_offline_agents',
  UPDATE_BEHAVIORAL_BASELINES = 'update_behavioral_baselines',
  CALCULATE_COMPLIANCE = 'calculate_compliance',
  CLEANUP_OLD_METRICS = 'cleanup_old_metrics',
  CHECK_EXPIRING_CERTIFICATES = 'check_expiring_certificates',
  PROCESS_DLQ = 'process_dlq',
  HEALTH_CHECKS = 'health_checks',
}

// ─── Port: Maintenance Operations ───────────────────────

export interface MaintenanceOperationExecutor {
  execute(operation: MaintenanceOperation, tenantId: string): Promise<MaintenanceTaskResult>;
}

// ─── Use Case ───────────────────────────────────────────

export class RunComprehensiveMaintenance {
  constructor(
    private readonly executor: MaintenanceOperationExecutor,
  ) {}

  async execute(input: ComprehensiveMaintenanceInput): Promise<Result<ComprehensiveMaintenanceOutput, ApplicationError>> {
    const startTime = Date.now();
    const results: MaintenanceTaskResult[] = [];

    const operations = input.operations.length > 0
      ? input.operations
      : Object.values(MaintenanceOperation);

    for (const op of operations) {
      const opStart = Date.now();
      try {
        const result = await this.executor.execute(op, input.tenantId.value);
        results.push({ ...result, durationMs: Date.now() - opStart });
      } catch (err) {
        results.push({
          operation: op,
          success: false,
          processedCount: 0,
          message: 'Execution failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          durationMs: Date.now() - opStart,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return Result.success({
      totalOperations: results.length,
      successCount,
      failureCount,
      totalDurationMs: Date.now() - startTime,
      results,
    });
  }
}
