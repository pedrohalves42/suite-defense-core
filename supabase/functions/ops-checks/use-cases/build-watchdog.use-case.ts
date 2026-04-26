// build-watchdog.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';
import { withTimeout } from '../../_shared/timeout.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';

export class BuildWatchdogUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string) {
    const startedAt = Date.now();
    const GITHUB_TOKEN = Deno.env.get('BUILD_GH_TOKEN')!;
    const GITHUB_REPO = Deno.env.get('BUILD_GH_REPOSITORY')!;

    logger.info(`[BuildWatchdogUseCase][${requestId}] Starting watchdog check`);

    return await withTimeout(async () => {
      const { data: stuckBuilds, error: queryError } = await (this.checkRepository as any).supabase
        .from('agent_builds').select('id, github_run_id, created_at')
        .eq('build_status', 'building')
        .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

      if (queryError) throw queryError;

      if (!stuckBuilds || stuckBuilds.length === 0) {
        logger.info(`[BuildWatchdogUseCase][${requestId}] No stuck builds found`);
        return { success: true, checked_builds: 0, message: 'No stuck builds detected', requestId, timestamp: new Date().toISOString() };
      }

      logger.info(`[BuildWatchdogUseCase][${requestId}] Found ${stuckBuilds.length} potentially stuck builds`);
      const results = [];

      for (const build of stuckBuilds) {
        let shouldFail = false;
        let reason = 'Unknown';

        if (!build.github_run_id) {
          shouldFail = true;
          reason = 'No GitHub run ID - likely failed before workflow started';
        } else {
          try {
            const ghResponse = await fetchWithTimeout(
              `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${build.github_run_id}`,
              { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } }
            );

            if (ghResponse.ok) {
              const ghData = await ghResponse.json();
              if (ghData.status === 'completed' && ghData.conclusion !== 'success') {
                shouldFail = true;
                reason = `GitHub workflow ${ghData.conclusion}`;
              } else if (ghData.status === 'completed' && ghData.conclusion === 'success') {
                shouldFail = true;
                reason = 'GitHub workflow succeeded but callback never received';
              }
            } else if (ghResponse.status === 404) {
              shouldFail = true;
              reason = 'GitHub workflow not found (deleted or never existed)';
            }
          } catch (ghError) {
            logger.error(`[BuildWatchdogUseCase][${requestId}] GitHub API error for build ${build.id}`, ghError);
          }
        }

        if (shouldFail) {
          const { error: updateError } = await (this.checkRepository as any).supabase
            .from('agent_builds')
            .update({ build_status: 'failed', build_completed_at: new Date().toISOString(), error_message: `Build watchdog: ${reason}` })
            .eq('id', build.id);
          results.push({ build_id: build.id, action: 'marked_failed', reason, error: updateError?.message || null });
        }
      }

      await this.checkRepository.logScheduledJobRun({
        p_job_key: 'build-watchdog', p_success: true, p_duration_ms: Date.now() - startedAt,
        p_result: { checked_builds: stuckBuilds.length, marked_failed: results.length },
        p_processed_count: stuckBuilds.length, p_job_source: 'cron'
      });

      return { success: true, checked_builds: stuckBuilds.length, marked_failed: results.length, results, requestId, timestamp: new Date().toISOString() };
    }, { timeoutMs: 25000 });
  }
}
