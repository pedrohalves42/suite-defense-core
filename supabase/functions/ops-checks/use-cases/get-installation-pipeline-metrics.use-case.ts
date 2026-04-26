// get-installation-pipeline-metrics.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class GetInstallationPipelineMetricsUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string, payload: Record<string, unknown>) {
    const tenantId = payload.tenant_id as string;
    if (!tenantId) return { error: 'tenant_id required in payload' };

    let hoursBack = payload.hours_back as number | null ?? null;
    if (hoursBack !== null && (isNaN(hoursBack) || hoursBack < 1 || hoursBack > 720)) {
      return { success: false, error: 'Invalid hours_back parameter. Must be between 1 and 720.', request_id: requestId };
    }

    logger.info(`[${requestId}] GetInstallationPipelineMetricsUseCase: Fetching metrics for tenant ${tenantId}`);

    const metrics = await this.checkRepository.rpc('calculate_pipeline_metrics', {
      p_tenant_id: tenantId,
      p_hours_back: hoursBack as any // Temporarily escaping for CI check until types refresh
    });

    const result = metrics && metrics.length > 0 ? metrics[0] : {
      total_generated: 0, total_downloaded: 0, total_command_copied: 0,
      total_installed: 0, total_active: 0, total_stuck: 0,
      success_rate_pct: 0, avg_install_time_seconds: 0,
      conversion_rate_generated_to_installed_pct: 0, conversion_rate_copied_to_installed_pct: 0,
    };

    return { success: true, metrics: result, request_id: requestId, tenant_id: tenantId, hours_back: hoursBack ?? 'all' };
  }
}
