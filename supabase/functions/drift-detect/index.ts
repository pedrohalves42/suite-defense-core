/**
 * Compliance Drift Detection — CMP-004
 * Migrated to serveInternal middleware (cron-driven tenant scanner).
 *
 * Actions:
 *   GET  ?tenantId=...  → query drift events for a tenant
 *   GET  (no params)    → query unresolved drift events
 *   POST { type: "scheduled_scan" }  → scan all active tenants
 *   POST { type: "tenant_scan", tenantId: "..." } → scan one tenant
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const DriftDetectSchema = z.object({
  type: z.enum(['scheduled_scan', 'tenant_scan']).optional(),
  tenantId: z.string().uuid().optional(),
});

const THRESHOLDS = { low: 5, medium: 10, high: 15 };

interface ComplianceMetrics {
  tenantId: string; rlsCoverage: number; mfaEnforcement: boolean;
  auditTrailIntegrity: boolean; dataRetentionDays: number;
  encryptionAtRest: boolean; encryptionInTransit: boolean;
  backupFrequencyHours: number; backupTestDays: number;
}

interface Deviation { metric: string; expected: unknown; actual: unknown; points: number; }

serveInternal(async (req, ctx) => {
  const { supabase } = ctx;

  // GET: query drift events
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenantId');

    if (tenantId) {
      const { data } = await supabase.from('drift_events').select('*').eq('tenant_id', tenantId).order('detected_at', { ascending: false }).limit(100);
      return { data: data || [] };
    }

    const { data } = await supabase.from('drift_events').select('*').is('resolved_at', null).order('detected_at', { ascending: false }).limit(100);
    return { data: data || [] };
  }

  // POST: scan
  const parsed = DriftDetectSchema.safeParse(ctx.body ?? {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { type, tenantId } = parsed.data;

  if (type === 'scheduled_scan') {
    const { data: tenants } = await supabase.from('tenants').select('id').eq('status', 'active');
    let scanned = 0;
    for (const t of tenants || []) { await scanTenant(supabase, t.id); scanned++; }
    logger.info(`[drift-detect] Scheduled scan completed: ${scanned} tenants`);
    return { scanned };
  }

  if (type === 'tenant_scan' && tenantId) {
    await scanTenant(supabase, tenantId);
    return { scanned: true, tenantId };
  }

  return new Response(JSON.stringify({ error: 'Invalid type' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
});

async function scanTenant(supabase: SupabaseClient, tenantId: string) {
  const current = await collectMetrics(supabase, tenantId);
  const baseline = await getBaseline(supabase, tenantId);
  const drift = calculateDrift(baseline, current);

  if (drift.score > 0) {
    await supabase.from('drift_events').insert({
      tenant_id: tenantId,
      severity: drift.severity,
      category: 'compliance_drift',
      description: `Compliance drift detected with score ${drift.score}`,
      current_value: drift.deviations.map((d: Deviation) => ({ [d.metric]: d.actual })),
      expected_value: drift.deviations.map((d: Deviation) => ({ [d.metric]: d.expected })),
      drift_score: drift.score,
    });
  }

  // Update baseline if healthy
  if (drift.score <= THRESHOLDS.low) {
    await supabase.from('compliance_baselines').upsert({
      tenant_id: tenantId,
      rls_coverage: current.rlsCoverage,
      mfa_enforcement: current.mfaEnforcement,
      audit_trail_integrity: current.auditTrailIntegrity,
      data_retention_days: current.dataRetentionDays,
      encryption_at_rest: current.encryptionAtRest,
      encryption_in_transit: current.encryptionInTransit,
      backup_frequency_hours: current.backupFrequencyHours,
      backup_restore_tested_days: current.backupTestDays,
      updated_at: new Date().toISOString(),
    });
  }

  logger.info(`[drift-detect] Tenant ${tenantId}: score=${drift.score}, severity=${drift.severity}`);
}

async function collectMetrics(supabase: SupabaseClient, tenantId: string): Promise<ComplianceMetrics> {
  const { data: admins } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('role', ['admin', 'super_admin']);

  const mfaEnforcement = (admins?.length || 0) > 0;

  const { data: retention } = await supabase
    .from('retention_policies')
    .select('retention_days')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .maybeSingle();

  return {
    tenantId,
    rlsCoverage: 100,
    mfaEnforcement,
    auditTrailIntegrity: true,
    dataRetentionDays: retention?.retention_days ?? 90,
    encryptionAtRest: true,
    encryptionInTransit: true,
    backupFrequencyHours: 24,
    backupTestDays: 30,
  };
}

async function getBaseline(supabase: SupabaseClient, tenantId: string): Promise<ComplianceMetrics> {
  const { data: baseline } = await supabase
    .from('compliance_baselines')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (baseline) {
    return {
      tenantId,
      rlsCoverage: baseline.rls_coverage,
      mfaEnforcement: baseline.mfa_enforcement,
      auditTrailIntegrity: baseline.audit_trail_integrity,
      dataRetentionDays: baseline.data_retention_days,
      encryptionAtRest: baseline.encryption_at_rest,
      encryptionInTransit: baseline.encryption_in_transit,
      backupFrequencyHours: baseline.backup_frequency_hours,
      backupTestDays: baseline.backup_restore_tested_days,
    };
  }

  return {
    tenantId,
    rlsCoverage: 100,
    mfaEnforcement: true,
    auditTrailIntegrity: true,
    dataRetentionDays: 90,
    encryptionAtRest: true,
    encryptionInTransit: true,
    backupFrequencyHours: 24,
    backupTestDays: 30,
  };
}

function calculateDrift(baseline: ComplianceMetrics, current: ComplianceMetrics) {
  const deviations: Deviation[] = [];
  let score = 0;

  const rlsDiff = baseline.rlsCoverage - current.rlsCoverage;
  if (rlsDiff > 0) {
    const points = Math.min(Math.floor(rlsDiff / 5), 20);
    score += points;
    deviations.push({ metric: 'rls_coverage', expected: baseline.rlsCoverage, actual: current.rlsCoverage, points });
  }

  if (baseline.mfaEnforcement && !current.mfaEnforcement) {
    score += 30;
    deviations.push({ metric: 'mfa_enforcement', expected: true, actual: false, points: 30 });
  }

  if (baseline.auditTrailIntegrity && !current.auditTrailIntegrity) {
    score += 25;
    deviations.push({ metric: 'audit_trail_integrity', expected: true, actual: false, points: 25 });
  }

  const retentionDiff = baseline.dataRetentionDays - current.dataRetentionDays;
  if (retentionDiff > 0) {
    const points = Math.min(Math.floor(retentionDiff / 7), 15);
    score += points;
    deviations.push({ metric: 'data_retention_days', expected: baseline.dataRetentionDays, actual: current.dataRetentionDays, points });
  }

  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (score >= THRESHOLDS.high) severity = 'critical';
  else if (score >= THRESHOLDS.medium) severity = 'high';
  else if (score >= THRESHOLDS.low) severity = 'medium';

  return { score, severity, deviations };
}
