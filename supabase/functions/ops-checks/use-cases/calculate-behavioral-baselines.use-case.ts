// calculate-behavioral-baselines.use-case.ts
import { ICheckRepository } from '../../_shared/hexagonal/repositories/check.repository.ts';
import { logger } from '../../_shared/logger.ts';

export class CalculateBehavioralBaselinesUseCase {
  constructor(private readonly checkRepository: ICheckRepository) {}

  async execute(requestId: string, payload: any = {}) {
    const batchSize = Number(payload.batch_size) || 100;
    const concurrency = Number(payload.concurrency) || 5;
    const isAsync = payload.async === true;

    logger.info(`[${requestId}] CalculateBehavioralBaselinesUseCase: Starting baseline calculation (batchSize=${batchSize}, concurrency=${concurrency}, async=${isAsync})...`);

    if (isAsync) {
      // Background execution
      this.runCalculation(requestId, batchSize, concurrency).catch(err => {
        logger.error(`[${requestId}] Background baseline calculation failed:`, String(err));
      });
      return { 
        success: true, 
        message: 'Baseline calculation started in background', 
        requestId 
      };
    }

    return await this.runCalculation(requestId, batchSize, concurrency);
  }

  private async runCalculation(requestId: string, batchSize: number, concurrency: number) {
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;

    try {
      const { data: agents, error: agentsError } = await (this.checkRepository as any).supabase
        .from('agents_safe')
        .select('id, tenant_id, agent_name')
        .is('archived_at', null)
        .eq('status', 'active');

      if (agentsError) throw new Error(`Failed to fetch agents: ${agentsError.message}`);
      if (!agents || agents.length === 0) {
        logger.info(`[${requestId}] No active agents to process.`);
        return { message: 'No active agents', processed: 0 };
      }

      logger.info(`[${requestId}] Found ${agents.length} agents. Processing in batches of ${batchSize} with concurrency ${concurrency}`);

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Process in batches to avoid overwhelming memory/connections
      for (let i = 0; i < agents.length; i += batchSize) {
        const batch = agents.slice(i, i + batchSize);
        logger.info(`[${requestId}] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} agents)`);
        
        const results = await this.processBatch(requestId, batch, sevenDaysAgo, now, concurrency);
        processedCount += results.processed;
        errorCount += results.errors;

        logger.info(`[${requestId}] Progress: ${processedCount}/${agents.length} agents processed (${errorCount} errors)`);
      }

      const duration = Date.now() - startTime;
      const finalResult = { 
        success: true, 
        processed: processedCount, 
        errors: errorCount, 
        duration_ms: duration,
        total_agents: agents.length
      };

      logger.info(`[${requestId}] Baseline calculation complete: ${JSON.stringify(finalResult)}`);
      
      // Notify completion (persist to job logs)
      await this.logJobCompletion(requestId, finalResult);

      return finalResult;
    } catch (error) {
      logger.error(`[${requestId}] Fatal error in CalculateBehavioralBaselinesUseCase:`, String(error));
      await this.logJobCompletion(requestId, { success: false, error: String(error) });
      throw error;
    }
  }

  private async processBatch(requestId: string, batch: any[], sevenDaysAgo: Date, now: Date, concurrency: number) {
    let processed = 0;
    let errors = 0;
    
    // Controlled concurrency using a worker pool pattern
    const executing = new Set<Promise<void>>();
    for (const agent of batch) {
      const p = (async () => {
        try {
          await this.processAgent(agent, sevenDaysAgo, now);
          processed++;
        } catch (err) {
          logger.error(`[${requestId}] Error processing agent ${agent.agent_name} (${agent.id}):`, String(err));
          errors++;
        }
      })();
      
      executing.add(p);
      p.finally(() => executing.delete(p));
      
      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }
    
    await Promise.all(executing);
    return { processed, errors };
  }

  private async processAgent(agent: any, sevenDaysAgo: Date, now: Date) {
    const { data: processData, error: fetchError } = await (this.checkRepository as any).supabase
      .from('agent_processes')
      .select('processes, collected_at')
      .eq('agent_id', agent.id)
      .gte('collected_at', sevenDaysAgo.toISOString())
      .order('collected_at', { ascending: true });

    if (fetchError) throw new Error(`Failed to fetch processes for agent ${agent.id}: ${fetchError.message}`);
    if (!processData || processData.length < 3) return;

    const cpuValues: number[] = [];
    const processCountValues: number[] = [];

    for (const snapshot of processData) {
      const processes = snapshot.processes as any[];
      if (Array.isArray(processes)) {
        const totalCpu = processes.reduce((sum: number, p: any) => sum + (Number(p.cpu_percent || p.cpu || 0)), 0);
        cpuValues.push(Math.min(totalCpu, 100));
        processCountValues.push(processes.length);
      }
    }

    const baselineTypes = [
      { type: 'cpu_usage', values: cpuValues },
      { type: 'process_count', values: processCountValues }
    ];

    for (const { type, values } of baselineTypes) {
      if (values.length < 3) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const stdDev = Math.sqrt(variance);

      const baselinePayload = {
        agent_id: agent.id,
        tenant_id: agent.tenant_id,
        baseline_type: type,
        mean_value: Math.round(mean * 100) / 100,
        std_deviation: Math.round(stdDev * 100) / 100,
        threshold_multiplier: 2.5,
        baseline_data: {
          sample_count: values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          p50: this.percentile(values, 50),
          p90: this.percentile(values, 90),
          p99: this.percentile(values, 99)
        },
        baseline_period_start: sevenDaysAgo.toISOString(),
        baseline_period_end: now.toISOString(),
        is_active: true,
        last_updated: now.toISOString(),
      };

      // Atomic upsert attempt
      const { error: upsertError } = await (this.checkRepository as any).supabase
        .from('agent_behavioral_baseline')
        .upsert(baselinePayload, { onConflict: 'agent_id,baseline_type', ignoreDuplicates: false });

      if (upsertError) {
        // Fallback for older versions of PostgREST or specific constraints
        const { data: existing } = await (this.checkRepository as any).supabase
          .from('agent_behavioral_baseline')
          .select('id')
          .eq('agent_id', agent.id)
          .eq('baseline_type', type)
          .maybeSingle();

        if (existing) {
          await (this.checkRepository as any).supabase
            .from('agent_behavioral_baseline')
            .update(baselinePayload)
            .eq('id', existing.id);
        } else {
          await (this.checkRepository as any).supabase
            .from('agent_behavioral_baseline')
            .insert(baselinePayload);
        }
      }
    }
  }

  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round((sorted[Math.max(0, idx)] || 0) * 100) / 100;
  }

  private async logJobCompletion(requestId: string, result: any) {
    try {
      await (this.checkRepository as any).supabase.from('scheduled_job_runs').insert({
        job_key: 'calculate-behavioral-baselines',
        success: result.success !== false && result.errors === 0,
        duration_ms: result.duration_ms || 0,
        error: result.error || (result.errors > 0 ? `${result.errors} agents failed` : null),
        job_source: 'ops-checks',
        metadata: { ...result, requestId }
      });
    } catch (e) {
      logger.warn(`[${requestId}] Failed to log job completion:`, String(e));
    }
  }
}
