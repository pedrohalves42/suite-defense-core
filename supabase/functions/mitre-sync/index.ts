/**
 * MITRE ATT&CK Rule Sync Service
 * AGT-019: Pipeline automatico de atualizacao de regras MITRE
 * Migrated to serveInternal middleware.
 *
 * Actions: sync, rules, version, stale
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';

const MITRE_ENTERPRISE_URL =
  'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';

serveInternal(async (_req, ctx) => {
  const { supabase, body: rawBody, requestId } = ctx;
  const body = (rawBody as Record<string, unknown>) || {};
  const action = (body.action as string) || 'rules';

  // ── SYNC ──
  if (action === 'sync') {
    return await syncMitreRules(supabase);
  }

  // ── LIST RULES ──
  if (action === 'rules') {
    const { data, error } = await supabase
      .from('mitre_rules')
      .select('id, technique_id, name, tactic, platform, is_active, last_synced_at')
      .eq('is_active', true)
      .order('technique_id');
    if (error) throw error;
    return { rules: data ?? [] };
  }

  // ── VERSION ──
  if (action === 'version') {
    const { data } = await supabase
      .from('mitre_metadata')
      .select('version, synced_at, total_rules, new_rules, updated_rules')
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { metadata: data ?? { version: 'unknown', synced_at: null } };
  }

  // ── STALE CHECK ──
  if (action === 'stale') {
    const { data } = await supabase
      .from('mitre_rules')
      .select('technique_id, name, last_synced_at')
      .eq('is_active', true)
      .lt('last_synced_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('last_synced_at');
    return { stale_rules: data ?? [] };
  }

  return new Response(
    JSON.stringify({ error: `Unknown action: ${action}` }),
    { status: 400, headers: { 'Content-Type': 'application/json' } },
  );
});

async function syncMitreRules(supabase: SupabaseClient) {
  const t0 = Date.now();
  logger.info('[mitre-sync] Fetching MITRE Enterprise ATT&CK…');

  const resp = await fetchWithTimeout(MITRE_ENTERPRISE_URL);
  if (!resp.ok) throw new Error(`MITRE fetch failed: ${resp.status}`);
  const stix = await resp.json();

  const mitreVersion =
    stix.objects?.find((o: Record<string, unknown>) => o.type === 'x-mitre-collection')?.x_mitre_version ??
    stix.spec_version ??
    'unknown';

  const techniques = stix.objects.filter(
    (o: Record<string, unknown>) => o.type === 'attack-pattern' && !o.revoked,
  );
  let synced = 0;

  const BATCH = 50;
  for (let i = 0; i < techniques.length; i += BATCH) {
    const batch = techniques.slice(i, i + BATCH);
    const rows = batch.map((t: Record<string, unknown>) => ({
      technique_id:
        (t.external_references as Array<Record<string, unknown>>)?.find(
          (r) => r.source_name === 'mitre-attack',
        )?.external_id ?? t.id,
      name: t.name,
      description: ((t.description as string) ?? '').slice(0, 4000),
      tactic: (t.kill_chain_phases as Array<Record<string, unknown>>)?.[0]?.phase_name ?? 'unknown',
      platform: t.x_mitre_platforms ?? [],
      data_sources: t.x_mitre_data_sources ?? [],
      detection: ((t.x_mitre_detection as string) ?? '').slice(0, 4000),
      mitre_created: t.created,
      mitre_modified: t.modified,
      mitre_version: parseInt(String(t.x_mitre_version ?? '1'), 10) || 1,
      is_active: true,
      last_synced_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('mitre_rules')
      .upsert(rows, { onConflict: 'technique_id', ignoreDuplicates: false })
      .select('technique_id');

    if (error) {
      logger.error('[mitre-sync] Batch upsert error:', error.message);
    } else {
      synced += data?.length ?? 0;
    }
  }

  const durationMs = Date.now() - t0;

  // Persist sync metadata
  await supabase.from('mitre_metadata').insert({
    version: mitreVersion,
    synced_at: new Date().toISOString(),
    total_rules: techniques.length,
    new_rules: synced,
    updated_rules: 0,
    sync_duration_ms: durationMs,
  });

  logger.info(
    `[mitre-sync] Done in ${durationMs}ms: version=${mitreVersion}, total=${techniques.length}, upserted=${synced}`,
  );

  return { version: mitreVersion, total: techniques.length, upserted: synced, duration_ms: durationMs };
}
