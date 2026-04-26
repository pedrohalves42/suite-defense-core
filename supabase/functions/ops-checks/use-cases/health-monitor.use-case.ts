// health-monitor.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

interface HealthResult {
  stuck_jobs: { count: number; failed: number };
  pending_agents: { count: number };
  installation_health: { tenants_checked: number; alerts: number };
  agent_health: { offline: number; total_active: number };
  dlq_exhaustion: { exhausted: number; alerts_created: number };
  slow_operations: { count: number };
  stuck_agents: { count: number };
  thresholds: { breaches: number };
  stuck_installations: { count: number };
  duration_ms: number;
}

export class HealthMonitorUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string, _payload: Record<string, unknown>) {
    const startedAt = Date.now();

    const result: HealthResult = {
      stuck_jobs: { count: 0, failed: 0 },
      pending_agents: { count: 0 },
      installation_health: { tenants_checked: 0, alerts: 0 },
      agent_health: { offline: 0, total_active: 0 },
      dlq_exhaustion: { exhausted: 0, alerts_created: 0 },
      slow_operations: { count: 0 },
      stuck_agents: { count: 0 },
      thresholds: { breaches: 0 },
      stuck_installations: { count: 0 },
      duration_ms: 0,
    };

    try {
      const results = await Promise.allSettled([
        (async () => {
          const cutoff = new Date(Date.now() - 45 * 60 * 1000).toISOString();
          const jobs = await this.checkRepository.getJobs({
            eq: { status: 'delivered' },
            lt: { delivered_at: cutoff }
          });
          
          if (!jobs?.length) return;
          result.stuck_jobs.count = jobs.length;
          const ids = jobs.map((j: any) => j.id);
          // Note: We might need a generic update method in repository, but for now we use rpc or direct
          // Since it's a batch update, I'll use the supabase client directly for now or add a method.
          const { error: updateErr } = await this.checkRepository.supabase
            .from('jobs').update({ status: 'failed', error_message: 'Zombie: no result after timeout' }).in('id', ids);
          if (!updateErr) result.stuck_jobs.failed = ids.length;
        })(),
        (async () => {
          const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const count = await this.checkRepository.getCount('agents', {
            eq: { last_heartbeat: 'null' as any },
            lt: { enrolled_at: cutoff }
          });
          result.pending_agents.count = count;
        })(),
        (async () => {
          const offlineCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
          const offlineCount = await this.checkRepository.getCount('agents', {
            eq: { status: 'active' },
            lt: { last_heartbeat: offlineCutoff }
          });
          result.agent_health.offline = offlineCount;
          const totalActive = await this.checkRepository.getCount('agents', {
            eq: { status: 'active' }
          });
          result.agent_health.total_active = totalActive;
        })(),
        (async () => {
          const dlqItems = await this.checkRepository.supabase
            .from('failed_jobs_dlq').select('id, tenant_id, failure_class').eq('status', 'exhausted').limit(100);
          
          if (dlqItems.error) { logger.error('[health-monitor] dlq error:', dlqItems.error.message); return; }
          const data = dlqItems.data;
          result.dlq_exhaustion.exhausted = data?.length || 0;
          if (data?.length) {
            const dlqIds = data.map((d: any) => d.id);
            const { data: existing } = await this.checkRepository.supabase
              .from('dlq_exhaustion_alerts').select('dlq_item_id').in('dlq_item_id', dlqIds);
            const existingIds = new Set(existing?.map((e: any) => e.dlq_item_id) || []);
            const newItems = data.filter((d: any) => !existingIds.has(d.id));
            if (newItems.length) {
              const alerts = newItems.map((item: any) => ({ dlq_item_id: item.id, tenant_id: item.tenant_id, severity: 'high', failure_class: item.failure_class }));
              await this.checkRepository.supabase.from('dlq_exhaustion_alerts').insert(alerts);
              result.dlq_exhaustion.alerts_created = newItems.length;
            }
          }
        })(),
        (async () => {
          const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const count = await this.checkRepository.getCount('performance_metrics', {
            gte: { created_at: fiveMinAgo, duration_ms: 2000 }
          });
          result.slow_operations.count = count;
        })(),
        (async () => {
          const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
          const stuckAgents = await this.checkRepository.getAgents({
            in: { status: ['pending'] },
            neq: { last_heartbeat: 'null' as any }, // This should be is null, using is(key, null) in repo
            lt: { enrolled_at: cutoff }
          });
          result.stuck_agents.count = stuckAgents?.length || 0;
          if (stuckAgents?.length) {
            const alerts = stuckAgents.map((a: any) => ({
              tenant_id: a.tenant_id,
              severity: 'medium' as any,
              alert_type: 'stuck_agent',
              title: `Stuck agent: ${a.agent_name}`,
              message: `Agent '${a.agent_name}' stuck in pending for ${Math.floor((Date.now() - new Date(a.enrolled_at).getTime()) / 60000)} min`,
              details: { agent_id: a.id, agent_name: a.agent_name } as any,
            }));
            await this.checkRepository.createSystemAlert(alerts);
          }
        })(),
        (async () => {
          const stuckLifecycle = await this.checkRepository.getStuckAgentLifecycle();
          result.stuck_installations.count = stuckLifecycle?.length || 0;
        })(),
      ]);

      results.forEach((r, i) => { if (r.status === 'rejected') logger.error(`[health-monitor] Check ${i} failed:`, r.reason); });

      result.duration_ms = Date.now() - startedAt;

      await this.checkRepository.updateCronHealth('health-monitor', true, result);

      logger.info(`[health-monitor] Completed in ${result.duration_ms}ms`);
      return { success: true, ...result };
    } catch (e) {
      const msg = (e as Error).message;
      logger.error('[health-monitor] Fatal:', msg);
      await this.checkRepository.updateCronHealth('health-monitor', false, { error: msg });
      throw e;
    }
  }
}
