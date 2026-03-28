/**
 * Agent Version Management Service
 * AGT-028: Enforcement de versão da frota e compliance
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';

const VERSION_TOLERANCE = 2;

serveTenant(async (_req, ctx) => {
  const { supabase, body, requestId } = ctx;
  const action = body.action ?? 'fleet-compliance';

  if (action === 'fleet-compliance') {
    return await getFleetCompliance(supabase, body.tenant_id);
  }

  if (action === 'enforce-update') {
    return await enforceUpdate(supabase, body.tenant_id, body.dry_run ?? true);
  }

  if (action === 'set-min-version') {
    if (!body.tenant_id || !body.min_version) {
      return new Response(
        JSON.stringify({ error: 'tenant_id and min_version required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return await setMinVersion(supabase, body.tenant_id, body.min_version, body.reason);
  }

  return new Response(
    JSON.stringify({ error: `Unknown action: ${action}` }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
}, {
  tenantSource: 'body',
  allowFallback: true,
  methods: ['POST'],
});

// ── Helpers ──────────────────────────────────────────

function parseVersion(v: string): number[] {
  return (v ?? '0.0.0').replace(/^v/i, '').split('.').map(Number);
}

function versionGap(current: string, latest: string): number {
  const c = parseVersion(current);
  const l = parseVersion(latest);
  return (l[0] - c[0]) * 100 + (l[1] - c[1]) * 10 + (l[2] - c[2]);
}

async function latestActiveVersion(supabase: Record<string, unknown>): Promise<string> {
  const { data } = await supabase
    .from('agent_releases_public')
    .select('version')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.version ?? 'v5.0.15';
}

async function getFleetCompliance(supabase: any, tenantId?: string) {
  let q = supabase
    .from('agents_safe')
    .select('id, tenant_id, agent_version, last_seen_at, status')
    .in('status', ['active', 'online', 'idle']);

  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data: agents, error } = await q;
  if (error) throw error;

  const latest = await latestActiveVersion(supabase);
  const byVersion: Record<string, number> = {};
  const outdated: Array<Record<string, unknown>> = [];

  for (const a of agents ?? []) {
    const ver = a.agent_version ?? 'unknown';
    byVersion[ver] = (byVersion[ver] || 0) + 1;
    const gap = versionGap(ver, latest);
    if (gap > VERSION_TOLERANCE) {
      outdated.push({ agent_id: a.id, tenant_id: a.tenant_id, version: ver, gap, last_seen: a.last_seen_at });
    }
  }

  const total = agents?.length ?? 0;
  const pct = total > 0 ? Math.round(((total - outdated.length) / total) * 100) : 100;

  return {
    latest_version: latest,
    total_agents: total,
    compliant: total - outdated.length,
    outdated: outdated.length,
    compliance_pct: pct,
    by_version: byVersion,
    agents_needing_update: outdated.slice(0, 200),
  };
}

async function enforceUpdate(supabase: any, tenantId?: string, dryRun = true) {
  const compliance = await getFleetCompliance(supabase, tenantId);
  const latest = compliance.latest_version;
  let scheduled = 0;
  let failed = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const agent of compliance.agents_needing_update) {
    if (dryRun) {
      details.push({ agent_id: agent.agent_id, version: agent.version, action: 'would_schedule' });
      continue;
    }
    try {
      await supabase.from('agent_update_events').insert({
        agent_id: agent.agent_id,
        tenant_id: agent.tenant_id,
        current_version: agent.version,
        target_version: latest,
        status: 'forced',
        triggered_by: 'version_enforcement',
      });
      scheduled++;
      details.push({ agent_id: agent.agent_id, action: 'scheduled' });
    } catch (e: Record<string, unknown>) {
      failed++;
      details.push({ agent_id: agent.agent_id, action: 'failed', error: e.message });
    }
  }

  await supabase.from('audit_logs').insert({
    event_type: 'version_enforcement',
    actor_id: '00000000-0000-0000-0000-000000000000',
    tenant_id: tenantId ?? '00000000-0000-0000-0000-000000000000',
    details: { dry_run: dryRun, scheduled, failed, total: compliance.agents_needing_update.length },
  });

  return { dry_run: dryRun, scheduled, failed, details: details.slice(0, 50) };
}

async function setMinVersion(supabase: any, tenantId: string, minVersion: string, reason?: string) {
  const { error } = await supabase
    .from('tenant_version_policies')
    .upsert(
      { tenant_id: tenantId, min_version: minVersion, reason: reason ?? '', updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    );
  if (error) throw error;
  return { success: true, tenant_id: tenantId, min_version: minVersion };
}
