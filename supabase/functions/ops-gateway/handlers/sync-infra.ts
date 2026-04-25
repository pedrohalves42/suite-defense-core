// @ts-nocheck
/**
 * Sync Infra handlers (Batch 3B) — maintenance, sync, storage
 * Inlined from: sync-blocked-websites, maintenance-cron, system-maintenance,
 *   release-sync, sync-storage-bucket, sync-stripe-subscriptions, sync-threat-feeds
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { recordMetric } from '../../_shared/apm.ts';
import { fetchWithTimeout } from '../../_shared/fetch-with-timeout.ts';

type SB = any;

// ── sync-blocked-websites ────────────────────────────────────────────────

export async function handleSyncBlockedWebsites(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const tenantId = payload.tenant_id as string;
  if (!tenantId) return { error: 'tenant_id required' };

  const { data: blockedSites, error: blockedError } = await supabase
    .from('blocked_websites').select('domain_pattern')
    .eq('tenant_id', tenantId).eq('is_active', true);
  if (blockedError) throw new Error('Failed to fetch blocked websites');

  const blockedDomains = blockedSites?.map(s => s.domain_pattern) || [];

  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: agents, error: agentsError } = await supabase
    .from('agents').select('id, agent_name')
    .eq('tenant_id', tenantId).gt('last_heartbeat', thirtyMinutesAgo);
  if (agentsError) throw new Error('Failed to fetch agents');

  if (!agents || agents.length === 0) {
    return { success: true, message: 'No online agents found', jobs_created: 0 };
  }

  // Cancel existing pending sync jobs
  const agentIds = agents.map(a => a.id);
  await supabase.from('jobs')
    .update({ status: 'cancelled', error_message: 'Superseded by new sync request' })
    .eq('type', 'sync_blocked_websites').eq('tenant_id', tenantId)
    .in('agent_id', agentIds).in('status', ['pending', 'queued', 'delivered']);

  const jobsToCreate = agents.map(agent => ({
    agent_id: agent.id, agent_name: agent.agent_name, tenant_id: tenantId,
    type: 'sync_blocked_websites', status: 'queued', priority: 2, approved: true,
    payload: { blocked_domains: blockedDomains, action: 'sync', apply_to_hosts: true, flush_dns: true, timestamp: new Date().toISOString() },
  }));

  const { data: createdJobs, error: jobsError } = await supabase.from('jobs').insert(jobsToCreate).select('id');
  if (jobsError) throw new Error('Failed to create sync jobs');

  return {
    success: true,
    message: `Sincronizacao agendada para ${agents.length} computadores`,
    jobs_created: createdJobs?.length || 0,
    blocked_domains_count: blockedDomains.length,
    agents: agents.map(a => a.agent_name),
  };
}

// ── maintenance-cron ─────────────────────────────────────────────────────
// Uses lazy import to pull in phase-handlers (kept in _shared for reuse)

export async function handleMaintenanceCron(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  // Lazy import from the standalone's helper — moved to _shared
  const { createEmptyResult, runMaintenanceRpc, cleanupStuckJobs, autoCleanupJobs, runRemainingPhases, cleanupLegacyScripts, computeTotalOps } =
    await import('../../maintenance-cron/phase-handlers.ts');

  const startTime = Date.now();
  const now = new Date().toISOString();
  const result = createEmptyResult();

  try {
    await runMaintenanceRpc(supabase, result);
    await cleanupStuckJobs(supabase, now, result);
    await autoCleanupJobs(supabase, now, result);
    await runRemainingPhases(supabase, now, result);
    await cleanupLegacyScripts(supabase, result);

    result.duration_ms = Date.now() - startTime;
    result.total_operations = computeTotalOps(result);

    recordMetric({ function_name: 'maintenance-cron', operation_type: 'edge_function', duration_ms: result.duration_ms, status_code: 200, metadata: result as unknown as Record<string, any> }).catch(() => {});
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'maintenance-cron-consolidated', p_success: true, p_duration_ms: result.duration_ms, p_result: result, p_processed_count: result.total_operations, p_job_source: 'cron' }); } catch (err) { logger.warn('[maintenance-cron] log failed', err); }
    try { await supabase.rpc('update_cron_health', { p_cron_name: 'maintenance-cron', p_success: true, p_details: result }); } catch (err) { logger.warn('[maintenance-cron] health update failed', err); }

    return { success: true, ...result };
  } catch (error) {
    const err = error as Error;
    result.duration_ms = Date.now() - startTime;
    try { await supabase.rpc('mark_cron_failure', { p_cron_name: 'maintenance-cron', p_error: err.message }); } catch (_) { /* ignore */ }
    throw error;
  }
}

// ── system-maintenance ───────────────────────────────────────────────────

type TaskName = 'stale_updates' | 'stale_reports' | 'stale_playbooks' | 'stuck_builds' | 'stuck_jobs' | 'offline_agents_jobs' | 'security_cleanup';

const ALL_TASKS: TaskName[] = ['stale_updates', 'stale_reports', 'stale_playbooks', 'stuck_builds', 'stuck_jobs', 'offline_agents_jobs', 'security_cleanup'];

export async function handleSystemMaintenance(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  // Lazy import tasks module
  const { cleanStaleUpdates, cleanStaleReports, cleanStalePlaybooks, cleanStuckBuilds, cleanStuckJobs, cleanOfflineAgentsJobs, securityCleanup } =
    await import('../../system-maintenance/tasks.ts');

  const startedAt = Date.now();
  const TASK_MAP: Record<TaskName, (sb: SB) => Promise<{ task: string; processed: number; cleaned: number; errors: string[]; duration_ms: number }>> = {
    stale_updates: cleanStaleUpdates, stale_reports: cleanStaleReports,
    stale_playbooks: cleanStalePlaybooks, stuck_builds: cleanStuckBuilds,
    stuck_jobs: cleanStuckJobs, offline_agents_jobs: cleanOfflineAgentsJobs,
    security_cleanup: securityCleanup,
  };

  let tasks: TaskName[] = ALL_TASKS;
  if (Array.isArray(payload.tasks) && payload.tasks.length > 0) {
    tasks = payload.tasks as TaskName[];
  }

  const results = await Promise.all(
    tasks.map(async (task) => {
      const fn = TASK_MAP[task];
      if (!fn) return { task, processed: 0, cleaned: 0, errors: ['Unknown task'], duration_ms: 0 };
      return await fn(supabase);
    })
  );

  const totalCleaned = results.reduce((s, r) => s + r.cleaned, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'system-maintenance',
      p_status: totalErrors > 0 ? 'partial' : 'success',
      p_details: { results, duration_ms: Date.now() - startedAt },
    });
  } catch (err) { logger.warn('[system-maintenance] log failed', err); }

  return { success: true, requestId, tasks_run: tasks.length, total_cleaned: totalCleaned, total_errors: totalErrors, results, duration_ms: Date.now() - startedAt };
}

// ── release-sync ─────────────────────────────────────────────────────────

export async function handleReleaseSync(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const startedAt = Date.now();
  const action = (payload.action as string) || 'sync_all';
  const platform = payload.platform as string | undefined;
  const version = payload.version as string | undefined;

  const result = { action, success: false, releases_processed: 0, releases_updated: 0, errors: [] as string[], duration_ms: 0 };

  let query = supabase.from('agent_releases').select('id, version, platform, script_content, is_active, download_url, storage_path');
  if (platform) query = query.eq('platform', platform);
  if (version) query = query.eq('version', version);
  if (action !== 'validate') query = query.eq('is_active', true);

  const { data: releases, error: fetchErr } = await query;
  if (fetchErr) { result.errors.push(fetchErr.message); result.duration_ms = Date.now() - startedAt; return result; }
  if (!releases || releases.length === 0) { result.success = true; result.duration_ms = Date.now() - startedAt; return result; }

  result.releases_processed = releases.length;

  for (const release of releases) {
    try {
      if (action === 'validate') {
        if (!release.script_content && !release.storage_path) result.errors.push(`Release ${release.version}/${release.platform}: no content or storage path`);
        continue;
      }
      if (!release.script_content && release.storage_path) {
        const { data: fileData, error: dlErr } = await supabase.storage.from('agent-installers').download(release.storage_path);
        if (dlErr || !fileData) { result.errors.push(`Release ${release.version}: download failed`); continue; }
        const content = await fileData.text();
        const { error: updateErr } = await supabase.from('agent_releases').update({ script_content: content }).eq('id', release.id);
        if (updateErr) result.errors.push(`Release ${release.version}: update failed`);
        else result.releases_updated++;
      } else if (release.script_content && (action === 'sync_from_repo' || action === 'sync_all')) {
        const storagePath = `scripts/${release.platform}/${release.version}/install.ps1`;
        const { error: uploadErr } = await supabase.storage.from('agent-installers').upload(storagePath, new Blob([release.script_content]), { upsert: true, contentType: 'text/plain' });
        if (uploadErr) result.errors.push(`Release ${release.version}: upload failed`);
        else { await supabase.from('agent_releases').update({ storage_path: storagePath }).eq('id', release.id); result.releases_updated++; }
      }
    } catch (e) { result.errors.push(`Release ${release.version}: ${String(e)}`); }
  }

  result.success = result.errors.length === 0;
  result.duration_ms = Date.now() - startedAt;
  try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'release-sync', p_status: result.success ? 'success' : 'partial', p_details: { ...result, requestId } }); } catch (_) { /* ignore */ }
  return { ...result, requestId };
}

// ── sync-storage-bucket ──────────────────────────────────────────────────

export async function handleSyncStorageBucket(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  const platform = (payload.platform as string) || 'windows';
  const force = (payload.force as boolean) || false;

  const { data: releaseData, error: releaseError } = await supabase
    .from('agent_releases')
    .select('id, script_content, version, sha256, created_at')
    .eq('platform', platform).eq('is_active', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (releaseError || !releaseData?.script_content) {
    return { error: `No active ${platform} release found`, requestId };
  }

  // Unified pipeline: decode → hotfix → reject HTML → normalize → SHA-256 → base64
  const { prepareAgentScriptContent } = await import('../../_shared/agent-script-preparation.ts');
  const prepared = await prepareAgentScriptContent({
    supabase,
    releaseId: releaseData.id,
    rawScriptContent: releaseData.script_content,
    platform,
    requestId,
    logScope: 'sync-storage-bucket',
    persistIfChanged: true,
  });

  if (!prepared) {
    return { error: `Script preparation failed for ${platform}`, requestId };
  }

  const calculatedSha256 = prepared.sha256;

  const scriptFileName = platform === 'windows' ? 'cybershield-agent-windows-v5.ps1'
    : platform === 'linux' ? 'cybershield-agent-linux-v5.sh' : 'cybershield-agent-macos-v5.sh';
  const filePath = `scripts/${scriptFileName}`;

  let needsUpdate = force;
  let currentStorageHash = '';

  if (!force) {
    try {
      const { data: currentFile, error: downloadError } = await supabase.storage.from('agent-installers').download(filePath);
      if (!downloadError && currentFile) {
        const currentContent = await currentFile.text();
        const encoder = new TextEncoder();
        const currentBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(currentContent));
        currentStorageHash = Array.from(new Uint8Array(currentBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        if (currentStorageHash === calculatedSha256) {
          return { success: true, synced: false, message: 'Storage already synced', version: releaseData.version, sha256: calculatedSha256, platform, requestId };
        }
        needsUpdate = true;
      } else { needsUpdate = true; }
    } catch { needsUpdate = true; }
  }

  if (!needsUpdate) return { success: true, synced: false, message: 'No update needed', version: releaseData.version, requestId };

  // Use the normalized content from the unified pipeline
  const { error: uploadError } = await supabase.storage.from('agent-installers')
    .upload(filePath, new Blob([prepared.normalizedContent], { type: 'application/octet-stream' }), { upsert: true, contentType: 'application/octet-stream' });
  if (uploadError) throw uploadError;

  return { success: true, synced: true, message: `Storage synced with ${releaseData.version}`, platform, version: releaseData.version, file_path: filePath, size_bytes: prepared.normalizedContent.length, sha256: calculatedSha256, expected_sha256: calculatedSha256, previous_hash: currentStorageHash || null, requestId };
}

// ── sync-stripe-subscriptions ────────────────────────────────────────────

export async function handleSyncStripeSubscriptions(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');

  const { default: Stripe } = await import('https://esm.sh/stripe@18.5.0');
  const stripe = new Stripe(stripeKey, { apiVersion: '2025-08-27.basil' });

  const { data: subscriptions, error } = await supabase
    .from('tenant_subscriptions')
    .select(`tenant_id, stripe_subscription_id, status, subscription_plans!inner(name)`)
    .not('stripe_subscription_id', 'is', null);
  if (error) throw error;

  let syncedCount = 0, errorCount = 0;

  const typedSubs = (subscriptions || []).map((sub: Record<string, unknown>) => ({
    tenant_id: sub.tenant_id as string,
    stripe_subscription_id: sub.stripe_subscription_id as string,
    status: sub.status as string,
    plan_name: (sub.subscription_plans as Record<string, unknown>)?.name as string || 'free',
  }));

  for (const sub of typedSubs) {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const quantity = stripeSub.items.data[0]?.quantity || 1;
      const status = stripeSub.status;
      const trialEnd = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null;
      const currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();

      if (sub.status !== status) {
        await supabase.from('tenant_subscriptions')
          .update({ device_quantity: quantity, status, trial_end: trialEnd, current_period_end: currentPeriodEnd })
          .eq('tenant_id', sub.tenant_id);
        await supabase.rpc('ensure_tenant_features', { p_tenant_id: sub.tenant_id, p_plan_name: sub.plan_name, p_device_quantity: quantity });
        syncedCount++;
      }
    } catch (err) { logger.error(`[sync-stripe][${requestId}] Error for ${sub.tenant_id}:`, err); errorCount++; }
  }

  return { success: true, synced: syncedCount, errors: errorCount };
}

// ── sync-threat-feeds ────────────────────────────────────────────────────

export async function handleSyncThreatFeeds(supabase: SB, requestId: string, payload: Record<string, unknown>) {
  // Lazy import feed fetchers
  const { fetchMalwareBazaarRecent, fetchURLhaus, fetchFeodoTracker } =
    await import('../../sync-threat-feeds/feed-fetchers.ts');

  let tenantIds: string[] = [];
  if (payload.tenant_id) tenantIds = [payload.tenant_id as string];
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
      catch (err) { return { name: feed.name, indicators: [] as Array<{ type: string; value: string; severity: string; tags: string[]; confidence: number; reference?: string; metadata?: Record<string, unknown> }>, error: err instanceof Error ? err.message : String(err) }; }
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
}