/**
 * MITRE ATT&CK Rule Sync Service
 * AGT-019: Pipeline automatico de atualizacao de regras MITRE
 * 
 * Endpoints:
 *   POST / (action=sync)  ? Sincroniza regras do MITRE CTI GitHub
 *   POST / (action=rules) ? Lista regras ativas
 *   POST / (action=version) ? Versao atual
 *   POST / (action=stale)   ? Regras desatualizadas
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const MITRE_ENTERPRISE_URL =
  'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin), status: 204 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: Missing credentials.' }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // Allow both internal (cron) and authenticated admin calls
  const authError = assertInternalCaller(req, { allowAuthenticatedUsers: true });
  if (authError) return authError;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'rules';

    // ?? SYNC ??????????????????????????????????????????
    if (action === 'sync') {
      const result = await syncMitreRules(supabase);
      return json(result);
    }

    // ?? LIST RULES ????????????????????????????????????
    if (action === 'rules') {
      const { data, error } = await supabase
        .from('mitre_rules')
        .select('id, technique_id, name, tactic, platform, is_active, last_synced_at')
        .eq('is_active', true)
        .order('technique_id');
      if (error) throw error;
      return json({ rules: data ?? [] });
    }

    // ?? VERSION ???????????????????????????????????????
    if (action === 'version') {
      const { data } = await supabase
        .from('mitre_metadata')
        .select('version, synced_at, total_rules, new_rules, updated_rules')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return json({ metadata: data ?? { version: 'unknown', synced_at: null } });
    }

    // ?? STALE CHECK ???????????????????????????????????
    if (action === 'stale') {
      const { data } = await supabase
        .from('mitre_rules')
        .select('technique_id, name, last_synced_at')
        .eq('is_active', true)
        .lt('last_synced_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('last_synced_at');
      return json({ stale_rules: data ?? [] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    logger.error('[mitre-sync] Error:', err);
    return json({ error: err.message }, 500);
  }
});

// ?? Helpers ????????????????????????????????????????????

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

async function syncMitreRules(supabase: ReturnType<typeof createClient>) {
  const t0 = Date.now();
  logger.info('[mitre-sync] Fetching MITRE Enterprise ATT&CK?');

  const resp = await fetchWithTimeout(MITRE_ENTERPRISE_URL);
  if (!resp.ok) throw new Error(`MITRE fetch failed: ${resp.status}`);
  const stix = await resp.json();

  const mitreVersion =
    stix.objects?.find((o: Record<string, unknown>) => o.type === 'x-mitre-collection')?.x_mitre_version ??
    stix.spec_version ??
    'unknown';

  const techniques = stix.objects.filter((o: Record<string, unknown>) => o.type === 'attack-pattern' && !o.revoked);
  let synced = 0;
  let updated = 0;

  const BATCH = 50;
  for (let i = 0; i < techniques.length; i += BATCH) {
    const batch = techniques.slice(i, i + BATCH);
    const rows = batch.map((t: Record<string, unknown>) => ({
      technique_id:
        t.external_references?.find((r: Record<string, unknown>) => r.source_name === 'mitre-attack')?.external_id ?? t.id,
      name: t.name,
      description: (t.description ?? '').slice(0, 4000),
      tactic: t.kill_chain_phases?.[0]?.phase_name ?? 'unknown',
      platform: t.x_mitre_platforms ?? [],
      data_sources: t.x_mitre_data_sources ?? [],
      detection: (t.x_mitre_detection ?? '').slice(0, 4000),
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
    updated_rules: updated,
    sync_duration_ms: durationMs,
  });

  logger.info(
    `[mitre-sync] Done in ${durationMs}ms: version=${mitreVersion}, total=${techniques.length}, upserted=${synced}`
  );

  return { version: mitreVersion, total: techniques.length, upserted: synced, duration_ms: durationMs };
}
