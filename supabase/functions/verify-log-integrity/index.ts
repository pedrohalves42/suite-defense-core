/**
 * Verify Log Integrity - Migrated to serveInternal middleware
 * Auth: JWT (admin) or X-Internal-Secret (cron/system-maintenance)
 * 
 * Verifies audit log hash chain integrity per tenant.
 * Records results in audit_integrity_checks and creates alerts for violations.
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface IntegrityCheckResult {
  tenant_id: string;
  total_logs: number;
  verified_logs: number;
  chain_valid: boolean;
  broken_links: string[];
  missing_hashes: number;
  checked_at: string;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startTime = Date.now();

  logger.info(`[${requestId}] Starting log integrity verification...`);

  // Get all tenants
  const { data: tenants, error: tenantsError } = await supabase
    .from('tenants')
    .select('id, name');

  if (tenantsError) throw tenantsError;

  const results: IntegrityCheckResult[] = [];
  const alerts: Array<{ tenant_id: string; message: string }> = [];

  for (const tenant of tenants || []) {
    logger.info(`[${requestId}] Checking tenant: ${tenant.id}`);

    const { data: logs, error: logsError } = await supabase
      .from('audit_logs')
      .select('id, created_at, evidence_hash, previous_hash')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: true })
      .limit(1000);

    if (logsError) {
      logger.error(`[${requestId}] Error fetching logs for tenant ${tenant.id}:`, logsError);
      continue;
    }

    const totalLogs = logs?.length || 0;
    let verifiedLogs = 0;
    let chainValid = true;
    const brokenLinks: string[] = [];
    let missingHashes = 0;
    let previousHash: string | null = null;

    for (const log of logs || []) {
      if (!log.evidence_hash) {
        missingHashes++;
        continue;
      }
      if (previousHash !== null && log.previous_hash !== previousHash) {
        chainValid = false;
        brokenLinks.push(log.id);
      }
      previousHash = log.evidence_hash;
      verifiedLogs++;
    }

    const result: IntegrityCheckResult = {
      tenant_id: tenant.id,
      total_logs: totalLogs,
      verified_logs: verifiedLogs,
      chain_valid: chainValid,
      broken_links: brokenLinks,
      missing_hashes: missingHashes,
      checked_at: new Date().toISOString(),
    };

    results.push(result);

    // Record check
    await supabase.from('audit_integrity_checks').insert({
      tenant_id: tenant.id,
      total_records: totalLogs,
      verified_records: verifiedLogs,
      chain_valid: chainValid,
      broken_links: brokenLinks.length,
      missing_hashes: missingHashes,
      check_type: 'daily_verification',
    });

    // Create alert if integrity issue found
    if (!chainValid || missingHashes > 0) {
      const message = !chainValid
        ? `Cadeia de hash quebrada em ${brokenLinks.length} log(s). Possivel adulteracao detectada.`
        : `${missingHashes} log(s) sem hash de evidencia. Integridade comprometida.`;

      alerts.push({ tenant_id: tenant.id, message });

      await supabase.from('system_alerts').insert({
        tenant_id: tenant.id,
        alert_type: 'integrity_violation',
        severity: 'critical',
        title: 'Violacao de Integridade de Logs',
        message,
        metadata: { broken_links: brokenLinks, missing_hashes: missingHashes, total_logs: totalLogs },
      });

      await supabase.from('ai_insights').insert({
        tenant_id: tenant.id,
        insight_type: 'security_threat',
        severity: 'critical',
        title: 'Integridade de Logs Comprometida',
        description: message,
        evidence: {
          check_result: result,
          action_required: 'Investigar imediatamente possivel adulteracao de logs',
        },
        suggested_action: 'Revisar logs de acesso, verificar permissoes de banco de dados e investigar possiveis acessos nao autorizados.',
      });

      logger.info(`[${requestId}] CRITICAL: Integrity issue found for tenant ${tenant.id}`);
    }
  }

  // Log job execution
  const durationMs = Date.now() - startTime;
  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'verify-log-integrity',
    p_success: true,
    p_duration_ms: durationMs,
    p_result: {
      tenants_checked: tenants?.length || 0,
      alerts_created: alerts.length,
      all_valid: alerts.length === 0,
      results: results.map(r => ({
        tenant_id: r.tenant_id,
        chain_valid: r.chain_valid,
        issues: r.broken_links.length + r.missing_hashes,
      })),
    },
    p_processed_count: tenants?.length || 0,
    p_job_source: 'cron',
  });

  logger.info(`[${requestId}] Verification complete in ${durationMs}ms`, {
    tenantsChecked: tenants?.length || 0,
    alertsCreated: alerts.length,
  });

  return {
    success: true,
    results,
    alerts,
    summary: {
      tenants_checked: tenants?.length || 0,
      alerts_created: alerts.length,
      all_valid: alerts.length === 0,
      duration_ms: durationMs,
    },
  };
});
