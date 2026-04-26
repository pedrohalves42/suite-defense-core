// run-scheduled-checks.ts - Use case to execute scheduled monitoring checks
import { ICheckRepository, Check } from '../repositories/check.repository.ts';
import { logger } from '../../logger.ts';
import { httpJson } from '../../http.ts';

export interface CheckExecutionResult {
  checkId: string;
  name: string;
  status: 'success' | 'error' | 'skipped';
  duration?: number;
  reason?: string;
  error?: string;
}

export interface RunScheduledChecksResult {
  success: boolean;
  results: CheckExecutionResult[];
  requestId: string;
}

export class RunScheduledChecksUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string): Promise<RunScheduledChecksResult> {
    const activeChecks = await this.checkRepository.listActiveChecks();
    const results: CheckExecutionResult[] = [];

    logger.info(`[RunScheduledChecksUseCase] Found ${activeChecks.length} active checks to execute.`);

    for (const check of activeChecks) {
      const startedAt = Date.now();
      try {
        let checkResult: unknown;
        
        // Determinar o tipo de execução baseado na configuração do check
        // check.check_type pode ser 'rpc', 'http', 'ping'
        const checkType = (check as Record<string, any>).check_type || 'rpc';

        if (checkType === 'rpc') {
          const rpcName = check.name.replaceAll('-', '_');
          try {
            // @ts-ignore: dynamic RPC call
            checkResult = await this.checkRepository.rpc(rpcName);
          } catch (rpcErr) {
            logger.warn(`[RunScheduledChecksUseCase] RPC ${rpcName} failed: ${rpcErr instanceof Error ? rpcErr.message : String(rpcErr)}`);
            throw rpcErr;
          }
        } else if (checkType === 'http') {
          const targetUrl = (check as Record<string, any>).target_url as string | undefined;
          if (!targetUrl) throw new Error(`HTTP Check ${check.name} missing target_url`);
          
          checkResult = await httpJson(targetUrl, {
            method: (check as Record<string, any>).method as string || 'GET',
            timeoutMs: (check as Record<string, any>).timeout_ms as number || 10000
          });
        } else {
          logger.warn(`[RunScheduledChecksUseCase] Unsupported check type: ${checkType} for ${check.name}`);
          results.push({ checkId: check.id, name: check.name, status: 'skipped', reason: 'Unsupported type' });
          continue;
        }

        // Sucesso
        const duration = Date.now() - startedAt;
        await this.checkRepository.saveCheckResult(check.id, { 
          success: true, 
          duration,
          data: checkResult as any
        });

        results.push({ 
          checkId: check.id, 
          name: check.name, 
          status: 'success', 
          duration 
        });

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(`[RunScheduledChecksUseCase] Error executing check ${check.name}:`, errorMsg);
        
        await this.checkRepository.logScheduledJobRun({
          p_job_key: check.name,
          p_success: false,
          p_duration_ms: Date.now() - startedAt,
          p_error: errorMsg,
          p_job_source: 'cron'
        });

        await this.checkRepository.saveCheckResult(check.id, { 
          success: false, 
          error: errorMsg 
        });

        results.push({ 
          checkId: check.id, 
          name: check.name, 
          status: 'error', 
          error: errorMsg 
        });
      }
    }

    return { success: true, results, requestId };
  }
}
