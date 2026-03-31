/**
 * INTEGRITY SENTINEL - CAMADA 3 do Zero Trust
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase } = ctx;
  const startTime = Date.now();

  try {
    // KILL SWITCH CHECK
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe');
    if (systemMode === 'halt_jobs') {
      logger.info('[integrity-sentinel] SYSTEM_HALTED: Kill switch active');
      return new Response(
        JSON.stringify({ success: false, error: 'SYSTEM_HALTED', message: 'Kill switch is active.' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[integrity-sentinel] Starting integrity check...');

    // 1. DETECT SILENT JOB FAILURES
    const { data: violations, error: violationsError } = await supabase.rpc('detect_silent_job_failures');

    if (violationsError) {
      logger.error('[integrity-sentinel] Error fetching violations:', violationsError);
    } else if (violations && violations.length > 0) {
      logger.error('[integrity-sentinel] CRITICAL: Found integrity violations!', { count: violations.length });

      const violationsByTenant = new Map<string, typeof violations>();
      for (const v of violations) {
        const existing = violationsByTenant.get(v.tenant_id) || [];
        existing.push(v);
        violationsByTenant.set(v.tenant_id, existing);
      }

      for (const [tenantId, tenantViolations] of violationsByTenant) {
        const { data: existingAlerts } = await supabase
          .from('system_alerts').select('id')
          .eq('tenant_id', tenantId).eq('alert_type', 'job_integrity_violation').eq('resolved', false)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()).limit(1);

        if (existingAlerts && existingAlerts.length > 0) continue;

        await supabase.from('system_alerts').insert({
          tenant_id: tenantId, alert_type: 'job_integrity_violation', severity: 'critical',
          message: `${tenantViolations.length} jobs marcados como completed SEM efeito colateral real`,
          data: {
            violations: tenantViolations.map((v: Record<string, unknown>) => ({
              job_id: v.job_id, job_type: v.job_type, agent_id: v.agent_id,
              agent_name: v.agent_name, completed_at: v.completed_at, violation_type: v.violation_type,
            })),
            detected_at: new Date().toISOString(), sentinel_run: true,
          },
          resolved: false,
        });
      }
    } else {
      logger.info('[integrity-sentinel] No integrity violations found');
    }

    // 2. VALIDATE SUPPLY CHAIN
    const { data: releaseIntegrity, error: releaseError } = await supabase.rpc('validate_agent_release_integrity');

    if (releaseError) {
      logger.error('[integrity-sentinel] Error validating release integrity:', releaseError);
    } else if (releaseIntegrity) {
      const invalidReleases = releaseIntegrity.filter((r: { is_valid: boolean }) => !r.is_valid);
      if (invalidReleases.length > 0) {
        logger.warn('[integrity-sentinel] Invalid agent releases found:', invalidReleases);
        await supabase.from('system_alerts').insert({
          tenant_id: null, alert_type: 'agent_release_integrity_warning', severity: 'high',
          message: `${invalidReleases.length} agent releases com problemas de integridade`,
          data: { invalid_releases: invalidReleases, detected_at: new Date().toISOString() },
          resolved: false,
        });
      }
    }

    // 3. JOBS COMPLETED WITHOUT OUTPUT
    const { data: emptyOutputJobs, error: emptyError } = await supabase
      .from('jobs').select('id, type, agent_name, created_at')
      .eq('status', 'completed').is('output', null)
      .in('type', ['collect_web_activity', 'collect_system_metrics', 'software_inventory_collect'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(100);

    const duration = Date.now() - startTime;
    logger.info('[integrity-sentinel] Check completed', {
      duration_ms: duration,
      violations_found: violations?.length || 0,
      release_issues: releaseIntegrity?.filter((r: { is_valid: boolean }) => !r.is_valid).length || 0,
      empty_output_jobs: emptyOutputJobs?.length || 0,
    });

    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'integrity-sentinel', p_success: true, p_duration_ms: duration,
      p_result: {
        violations_found: violations?.length || 0,
        release_issues: releaseIntegrity?.filter((r: { is_valid: boolean }) => !r.is_valid).length || 0,
        empty_output_jobs: emptyOutputJobs?.length || 0,
      },
      p_processed_count: (violations?.length || 0) + (emptyOutputJobs?.length || 0),
      p_job_source: 'cron',
    });

    await supabase.rpc('update_cron_health', { p_cron_name: 'integrity-sentinel-15min', p_success: true, p_error: null });

    return {
      success: true, timestamp: new Date().toISOString(), duration_ms: duration,
      violations_found: violations?.length || 0,
      alerts_created: violations?.length ? new Set(violations.map((v: Record<string, unknown>) => v.tenant_id)).size : 0,
    };
  } catch (err) {
    logger.error('[integrity-sentinel] Unhandled error:', err);
    try { await supabase.rpc('update_cron_health', { p_cron_name: 'integrity-sentinel-15min', p_success: false, p_error: err instanceof Error ? err.message : 'Unknown error' }); } catch { /* */ }
    try { await supabase.rpc('log_scheduled_job_run', { p_job_key: 'integrity-sentinel', p_success: false, p_duration_ms: Date.now() - startTime, p_error: err instanceof Error ? err.message : 'Unknown error', p_result: null, p_processed_count: 0, p_job_source: 'cron' }); } catch { /* */ }
    throw err;
  }
});
