// @ts-nocheck
import { ICheckRepository } from '../repositories/check.repository.ts';
import { logger } from '../../logger.ts';

export class RunScheduledChecksUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const activeChecks = await this.checkRepository.listActiveChecks();
    const results = [];

    logger.info(`[RunScheduledChecksUseCase] Found ${activeChecks.length} active checks to execute.`);

    for (const check of activeChecks) {
      const startedAt = Date.now();
      try {
        // Mapeamento de checks para os novos Handlers (em transição) ou lógica RPC
        let checkResult;
        
        // Se o check tem um trigger RPC associado (como definido na v_ops_checks se existisse)
        // Por enquanto, a maioria dos checks legados são acionados via RPC ou Handlers específicos
        // Vamos tentar chamar o RPC correspondente ao nome do check se ele seguir o padrão
        const rpcName = check.name.replaceAll('-', '_');
        
        try {
          checkResult = await this.checkRepository.rpc(rpcName);
          await this.checkRepository.saveCheckResult(check.id, { success: true, rpcResult: checkResult });
          results.push({ checkId: check.id, name: check.name, status: 'success', result: checkResult });
        } catch (rpcErr) {
          logger.warn(`[RunScheduledChecksUseCase] RPC ${rpcName} not found or failed, skipping generic execution: ${rpcErr.message}`);
          results.push({ checkId: check.id, name: check.name, status: 'skipped', reason: 'No handler or RPC' });
        }

      } catch (error) {
        logger.error(`[RunScheduledChecksUseCase] Error executing check ${check.name}:`, error);
        await this.checkRepository.logScheduledJobRun({
          p_job_key: check.name,
          p_success: false,
          p_duration_ms: Date.now() - startedAt,
          p_error: error instanceof Error ? error.message : String(error),
          p_job_source: 'cron'
        });
        results.push({ checkId: check.id, name: check.name, status: 'error', error: error.message });
      }
    }

    return { success: true, results, requestId };
  }
}
