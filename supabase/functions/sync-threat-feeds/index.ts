/**
 * sync-threat-feeds - Syncs threat intel from external feeds
 * MODULARIZED: Feed fetchers in feed-fetchers.ts
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchMalwareBazaarRecent, fetchURLhaus, fetchFeodoTracker, type RawIndicator } from './feed-fetchers.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId, body } = ctx;

  let tenantIds: string[] = [];
  const parsedBody = body as Record<string, unknown> | null;
  if (parsedBody?.tenant_id) tenantIds = [parsedBody.tenant_id as string];

  if (tenantIds.length === 0) {
    const { data: tenants } = await supabase.from('tenants').select('id').limit(50);
    tenantIds = (tenants || []).map((t: { id: string }) => t.id);
  }

  const feedConfigs = [
    { name: 'abuse_ch_malwarebazaar' as const, fetcher: fetchMalwareBazaarRecent },
    { name: 'abuse_ch_urlhaus' as const, fetcher: fetchURLhaus },
    { name: 'abuse_ch_feodotracker' as const, fetcher: fetchFeodoTracker },
  ];

  const feedResults = await Promise.all(
    feedConfigs.map(async (feed) => {
      try { return { name: feed.name, indicators: await feed.fetcher(), error: null }; }
      catch (err) { return { name: feed.name, indicators: [] as RawIndicator[], error: err instanceof Error ? err.message : String(err) }; }
    })
  );

  const results: Record<string, unknown>[] = [];
  const CONCURRENCY = 5;

  for (let t = 0; t < tenantIds.length; t += CONCURRENCY) {
    const tenantBatch = tenantIds.slice(t, t + CONCURRENCY);
    await Promise.all(tenantBatch.map(async (tenantId) => {
      for (const feed of feedResults) {
        const { data: syncLog } = await supabase.from('threat_feed_sync_log').insert({ tenant_id: tenantId, feed_source: feed.name, status: feed.error ? 'failed' : 'running', error_message: feed.error || null }).select('id').single();
        const syncId = syncLog?.id;

        if (feed.error || feed.indicators.length === 0) {
          if (syncId) await supabase.from('threat_feed_sync_log').update({ sync_completed_at: new Date().toISOString(), status: feed.error ? 'failed' : 'completed', indicators_fetched: 0, error_message: feed.error }).eq('id', syncId);
          results.push({ tenant_id: tenantId, feed: feed.name, status: feed.error ? 'failed' : 'completed', error: feed.error, fetched: 0 });
          continue;
        }

        try {
          let newCount = 0, updatedCount = 0;
          const batchSize = 50;
          for (let i = 0; i < feed.indicators.length; i += batchSize) {
            const batch = feed.indicators.slice(i, i + batchSize);
            const rows = batch.map(ind => ({ tenant_id: tenantId, indicator_type: ind.type, indicator_value: ind.value, severity: ind.severity, source: feed.name, source_reference: ind.reference, tags: ind.tags, confidence_score: ind.confidence, last_seen_at: new Date().toISOString(), is_active: true, metadata: ind.metadata || {} }));
            const { data: upserted, error: upsertErr } = await supabase.from('threat_indicators').upsert(rows, { onConflict: 'tenant_id,indicator_type,indicator_value,source', ignoreDuplicates: false }).select('id, created_at, updated_at');
            if (upsertErr) { logger.error(`Upsert error for ${feed.name}:`, upsertErr.message); continue; }
            if (upserted) {
              for (const row of upserted) {
                if (Math.abs(new Date(row.created_at).getTime() - new Date(row.updated_at).getTime()) < 2000) newCount++;
                else updatedCount++;
              }
            }
          }
          if (syncId) await supabase.from('threat_feed_sync_log').update({ sync_completed_at: new Date().toISOString(), indicators_fetched: feed.indicators.length, indicators_new: newCount, indicators_updated: updatedCount, status: 'completed' }).eq('id', syncId);
          results.push({ tenant_id: tenantId, feed: feed.name, fetched: feed.indicators.length, new: newCount, updated: updatedCount, status: 'completed' });
        } catch (feedErr) {
          const errMsg = feedErr instanceof Error ? feedErr.message : String(feedErr);
          if (syncId) await supabase.from('threat_feed_sync_log').update({ sync_completed_at: new Date().toISOString(), status: 'failed', error_message: errMsg }).eq('id', syncId);
          results.push({ tenant_id: tenantId, feed: feed.name, status: 'failed', error: errMsg });
        }
      }
    }));
  }

  return { success: true, results };
});
