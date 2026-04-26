import { ICheckRepository } from '../repositories/check.repository.ts';

export class RunScheduledChecksUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const activeChecks = await this.checkRepository.listActiveChecks();
    const results = [];

    for (const check of activeChecks) {
      const startedAt = Date.now();
      try {
        // Implementação simplificada para o esqueleto
        // Na prática, cada check teria sua lógica específica que seria delegada
        results.push({ checkId: check.id, status: 'success' });
      } catch (error) {
        await this.checkRepository.logScheduledJobRun({
          p_job_key: check.name,
          p_success: false,
          p_duration_ms: Date.now() - startedAt,
          p_error: error instanceof Error ? error.message : String(error),
          p_job_source: 'cron'
        });
        results.push({ checkId: check.id, status: 'error', error });
      }
    }

    return { success: true, results, requestId };
  }
}
