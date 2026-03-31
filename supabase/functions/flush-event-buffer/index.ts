/**
 * flush-event-buffer - Batch processor for event ingestion buffer
 * MODULARIZED: threat-intel.ts and event-processor.ts
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { loadThreatIntel, loadBaselines } from './threat-intel.ts';
import { processAndEnrichEvents } from './event-processor.ts';

const BATCH_SIZE = 5000;

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();

  // Step 1: Claim batch
  const batchId = crypto.randomUUID();
  const { data: claimedCount, error: claimError } = await supabase.rpc('claim_event_buffer_batch', { p_batch_id: batchId, p_limit: BATCH_SIZE });
  if (claimError) throw claimError;
  if (!claimedCount || claimedCount === 0) return { flushed: 0, message: 'Buffer empty' };

  // Step 2: Fetch claimed rows
  const { data: rows, error: fetchError } = await supabase.from('endpoint_event_buffer').select('id, tenant_id, agent_id, event_category, payload').eq('batch_id', batchId).is('processed_at', null);
  if (fetchError || !rows?.length) return { flushed: 0, message: 'Buffer empty' };

  // Step 3: Load threat intel & baselines in parallel, then process
  const [threatIntel, baselines] = await Promise.all([loadThreatIntel(supabase), loadBaselines(supabase)]);
  const { processEvents, fileEvents, networkEvents, registryEvents, processedIds, threatMatches, anomalyAlerts } = processAndEnrichEvents(rows, threatIntel, baselines);

  // Step 4: Batch insert into final tables
  const insertPromises: Promise<{ table: string; count: number; error?: string }>[] = [];
  if (processEvents.length > 0) insertPromises.push(supabase.from('endpoint_process_events').insert(processEvents).then(({ error }: any) => ({ table: 'process', count: error ? 0 : processEvents.length, error: error?.message })));
  if (fileEvents.length > 0) insertPromises.push(supabase.from('endpoint_file_events').insert(fileEvents).then(({ error }: any) => ({ table: 'file', count: error ? 0 : fileEvents.length, error: error?.message })));
  if (networkEvents.length > 0) insertPromises.push(supabase.from('endpoint_network_events').insert(networkEvents).then(({ error }: any) => ({ table: 'network', count: error ? 0 : networkEvents.length, error: error?.message })));
  if (registryEvents.length > 0) insertPromises.push(supabase.from('endpoint_registry_events').insert(registryEvents).then(({ error }: any) => ({ table: 'registry', count: error ? 0 : registryEvents.length, error: error?.message })));
  if (threatMatches.length > 0) insertPromises.push(supabase.from('threat_matches').insert(threatMatches).then(({ error }: any) => ({ table: 'threat_matches', count: error ? 0 : threatMatches.length, error: error?.message })));
  if (anomalyAlerts.length > 0) insertPromises.push(supabase.from('system_alerts').insert(anomalyAlerts).then(({ error }: any) => ({ table: 'anomaly_alerts', count: error ? 0 : anomalyAlerts.length, error: error?.message })));

  const results = await Promise.all(insertPromises);

  // Step 5: Mark rows as processed
  const failures = results.filter(r => r.error);
  if (failures.length > 0) {
    for (const f of failures) logger.error(`[flush-event-buffer] ${f.table} insert failed:`, f.error);
    const successTables = new Set(results.filter(r => !r.error).map(r => r.table));
    const successIds = rows.filter(r => successTables.has(r.event_category)).map(r => r.id);
    if (successIds.length > 0) await supabase.from('endpoint_event_buffer').update({ processed_at: new Date().toISOString() }).in('id', successIds);
  } else {
    const CHUNK = 500;
    const markPromises: Promise<any>[] = [];
    for (let i = 0; i < processedIds.length; i += CHUNK) {
      markPromises.push(supabase.from('endpoint_event_buffer').update({ processed_at: new Date().toISOString() }).in('id', processedIds.slice(i, i + CHUNK)));
    }
    await Promise.all(markPromises);
  }

  const elapsed = Date.now() - startTime;
  const stats = { flushed: processedIds.length, process: processEvents.length, file: fileEvents.length, network: networkEvents.length, registry: registryEvents.length, threat_matches: threatMatches.length, anomaly_alerts: anomalyAlerts.length, threat_intel_loaded: threatIntel.ips.size + threatIntel.hashes.size + threatIntel.domains.size, baselines_loaded: baselines.size, failures: failures.length, elapsed_ms: elapsed };
  logger.info(`[flush-event-buffer][${requestId}] Flushed ${stats.flushed} events in ${elapsed}ms`);

  return stats;
});
