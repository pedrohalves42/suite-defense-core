import { ICheckRepository, Check } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';
import { httpJson } from '../../_shared/http.ts';

export interface RunScheduledChecksResult {
  total: number;
  executed: number;
  success: number;
  failed: number;
  results: Array<{
    checkId: string;
    name: string;
    success: boolean;
    error?: string;
    latencyMs: number;
  }>;
}

export class RunScheduledChecksUseCase {
  constructor(private readonly repository: ICheckRepository) {}

  async execute(requestId: string): Promise<RunScheduledChecksResult> {
    const startedAt = Date.now();
    logger.info(`[${requestId}] RunScheduledChecksUseCase: Starting...`);

    const activeChecks = await this.repository.listActiveChecks();
    const results: RunScheduledChecksResult['results'] = [];

    for (const check of activeChecks) {
      const checkStartedAt = Date.now();
      let success = false;
      let errorMsg: string | undefined;
      let checkResult: any = null;

      try {
        // Simple executor logic based on check type
        if (check.check_type === 'http' && check.target_url) {
          checkResult = await httpJson(check.target_url, {
            timeoutMs: (check.timeout_ms as number) || 5000,
            method: (check.http_method as string) || 'GET'
          });
          success = true;
        } else if (check.check_type === 'db_query' && check.query_name) {
          // Future: use repository.rpc if query_name is a stored function
          checkResult = await this.repository.rpc(check.query_name, check.query_params || {});
          success = true;
        } else {
          errorMsg = `Unsupported check type: ${check.check_type}`;
        }
      } catch (err) {
        success = false;
        errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(`[${requestId}] Check ${check.name} (${check.id}) failed:`, errorMsg);
      }

      const latencyMs = Date.now() - checkStartedAt;
      const resultData = {
        success,
        latency_ms: latencyMs,
        error: errorMsg,
        data: checkResult,
        run_at: new Date().toISOString()
      };

      await this.repository.saveCheckResult(check.id, resultData);
      
      results.push({
        checkId: check.id,
        name: check.name,
        success,
        error: errorMsg,
        latencyMs
      });
    }

    const summary = {
      total: activeChecks.length,
      executed: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };

    // Log the overall run
    await this.repository.logScheduledJobRun({
      p_job_key: 'run-scheduled-checks',
      p_success: summary.failed === 0,
      p_duration_ms: Date.now() - startedAt,
      p_result: summary,
      p_processed_count: summary.executed,
      p_job_source: 'cron'
    });

    return summary;
  }
}
