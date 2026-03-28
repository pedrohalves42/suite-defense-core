import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts'
import { timingSafeEqual } from '../_shared/crypto-utils.ts'
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * INTEGRITY SENTINEL - CAMADA 3 do Zero Trust
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // V-1141: Defense-in-depth auth guard for cron function
  const authError = await assertInternalCaller(req)
  if (authError) return authError

  // Parse request body
  let body: { source?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine for cron calls
  }

  // Validate origin - accept if:
  // 1. Has valid internal secret header (timing-safe)
  // 2. Has valid JWT auth header
  const internalSecret = req.headers.get('x-internal-secret');
  const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const isInternalCall = internalSecret && expectedSecret && 
    await timingSafeEqual(internalSecret, expectedSecret);
  const authHeader = req.headers.get('Authorization');
  
  if (!isInternalCall && !authHeader) {
    logger.info('[integrity-sentinel] Unauthorized: No valid origin');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[integrity-sentinel] Authorized call from: ${isInternalCall ? 'internal' : 'jwt'}`);

  const supabase = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  )

  const startTime = Date.now()

  try {
    // KILL SWITCH CHECK (ADR-FINAL) - Halt all automation if system is in halt_jobs mode
    const { data: systemMode } = await supabase.rpc('get_system_mode_safe')
    if (systemMode === 'halt_jobs') {
      logger.info('[integrity-sentinel] SYSTEM_HALTED: Kill switch active, skipping integrity check')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SYSTEM_HALTED', 
          message: 'Kill switch is active. Set system_state.mode to normal to resume.' 
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    logger.info('[integrity-sentinel] Starting integrity check...')

    // ============================================================
    // 1. VERIFICAR VIOLAÇÕES DE INTEGRIDADE via RPC (mais eficiente)
    // Usa a view job_integrity_violations otimizada
    // ============================================================
    const { data: violations, error: violationsError } = await supabase
      .rpc('detect_silent_job_failures')

    if (violationsError) {
      logger.error('[integrity-sentinel] Error fetching violations:', violationsError)
    } else if (violations && violations.length > 0) {
      logger.error('[integrity-sentinel] 🔴 CRITICAL: Found integrity violations!', {
        count: violations.length,
        violations: violations.map((v: Record<string, unknown>) => ({
          job_id: v.job_id,
          job_type: v.job_type,
          agent_id: v.agent_id,
          agent_name: v.agent_name,
          completed_at: v.completed_at,
          violation_type: v.violation_type
        }))
      })

      // Agrupar por tenant para criar alertas
      const violationsByTenant = new Map<string, typeof violations>()
      for (const v of violations) {
        const existing = violationsByTenant.get(v.tenant_id) || []
        existing.push(v)
        violationsByTenant.set(v.tenant_id, existing)
      }

      // Criar alertas P0 para cada tenant afetado
      for (const [tenantId, tenantViolations] of violationsByTenant) {
        // Verificar se já existe alerta recente para evitar spam
        const { data: existingAlerts } = await supabase
          .from('system_alerts')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('alert_type', 'job_integrity_violation')
          .eq('resolved', false)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(1)

        if (existingAlerts && existingAlerts.length > 0) {
          logger.info('[integrity-sentinel] Skipping duplicate alert for tenant:', tenantId)
          continue
        }

        const { error: alertError } = await supabase
          .from('system_alerts')
          .insert({
            tenant_id: tenantId,
            alert_type: 'job_integrity_violation',
            severity: 'critical',
            message: `${tenantViolations.length} jobs marcados como completed SEM efeito colateral real detectados`,
            data: {
              violations: tenantViolations.map((v: Record<string, unknown>) => ({
                job_id: v.job_id,
                job_type: v.job_type,
                agent_id: v.agent_id,
                agent_name: v.agent_name,
                completed_at: v.completed_at,
                violation_type: v.violation_type
              })),
              detected_at: new Date().toISOString(),
              sentinel_run: true
            },
            resolved: false
          })

        if (alertError) {
          logger.error('[integrity-sentinel] Error creating alert for tenant:', tenantId, alertError)
        } else {
          logger.info('[integrity-sentinel] Created P0 alert for tenant:', tenantId)
        }
      }
    } else {
      logger.info('[integrity-sentinel] ✅ No integrity violations found')
    }

    // ============================================================
    // 2. VALIDAR SUPPLY CHAIN (agent_releases)
    // ============================================================
    const { data: releaseIntegrity, error: releaseError } = await supabase
      .rpc('validate_agent_release_integrity')

    if (releaseError) {
      logger.error('[integrity-sentinel] Error validating release integrity:', releaseError)
    } else if (releaseIntegrity) {
      const invalidReleases = releaseIntegrity.filter((r: { is_valid: boolean }) => !r.is_valid)
      
      if (invalidReleases.length > 0) {
        logger.warn('[integrity-sentinel] ⚠️ Invalid agent releases found:', invalidReleases)
        
        // Criar alerta para releases inválidos (não é P0, é warning)
        // Usar tenant null para alerta global
        const { error: releaseAlertError } = await supabase
          .from('system_alerts')
          .insert({
            tenant_id: null,
            alert_type: 'agent_release_integrity_warning',
            severity: 'high',
            message: `${invalidReleases.length} agent releases com problemas de integridade (SHA256 ou tamanho)`,
            data: {
              invalid_releases: invalidReleases,
              detected_at: new Date().toISOString()
            },
            resolved: false
          })

        if (releaseAlertError) {
          logger.error('[integrity-sentinel] Error creating release integrity alert:', releaseAlertError)
        }
      } else {
        logger.info('[integrity-sentinel] ✅ All agent releases valid')
      }
    }

    // ============================================================
    // 3. VERIFICAR JOBS COMPLETED SEM OUTPUT (últimas 24h)
    // ============================================================
    const { data: emptyOutputJobs, error: emptyError } = await supabase
      .from('jobs')
      .select('id, type, agent_name, created_at')
      .eq('status', 'completed')
      .is('output', null)
      .in('type', ['collect_web_activity', 'collect_system_metrics', 'software_inventory_collect'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(100)

    if (!emptyError && emptyOutputJobs && emptyOutputJobs.length > 0) {
      logger.warn('[integrity-sentinel] ⚠️ Jobs completed without output:', {
        count: emptyOutputJobs.length,
        sample: emptyOutputJobs.slice(0, 5)
      })
    }

    const duration = Date.now() - startTime
    logger.info('[integrity-sentinel] Check completed', {
      duration_ms: duration,
      violations_found: violations?.length || 0,
      release_issues: releaseIntegrity?.filter((r: { is_valid: boolean }) => !r.is_valid).length || 0,
      empty_output_jobs: emptyOutputJobs?.length || 0
    })

    // Log success with observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'integrity-sentinel',
      p_success: true,
      p_duration_ms: duration,
      p_result: {
        violations_found: violations?.length || 0,
        release_issues: releaseIntegrity?.filter((r: { is_valid: boolean }) => !r.is_valid).length || 0,
        empty_output_jobs: emptyOutputJobs?.length || 0,
        alerts_created: violations && violations.length > 0 ? new Set(violations.map((v: Record<string, unknown>) => v.tenant_id)).size : 0
      },
      p_processed_count: (violations?.length || 0) + (emptyOutputJobs?.length || 0),
      p_job_source: 'cron'
    });

    // Update cron health check (closes monitoring loop)
    await supabase.rpc('update_cron_health', {
      p_cron_name: 'integrity-sentinel-15min',
      p_success: true,
      p_error: null
    });

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        violations_found: violations?.length || 0,
        alerts_created: violations && violations.length > 0 ? new Set(violations.map((v: Record<string, unknown>) => v.tenant_id)).size : 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    logger.error('[integrity-sentinel] Unhandled error:', err)
    
    // Register failure in cron health check
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'integrity-sentinel-15min',
        p_success: false,
        p_error: err instanceof Error ? err.message : 'Unknown error'
      });
    } catch {
      logger.error('[integrity-sentinel] Failed to update cron health');
    }
    
    // Try to log failure
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'integrity-sentinel',
        p_success: false,
        p_duration_ms: Date.now() - startTime,
        p_error: err instanceof Error ? err.message : 'Unknown error',
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch {
      logger.error('[integrity-sentinel] Failed to log error');
    }

    return new Response(
      JSON.stringify({ error: 'Internal error', details: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
