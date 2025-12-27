import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * INTEGRITY SENTINEL - CAMADA 3 do Zero Trust
 * 
 * Função scheduled que roda a cada 5 minutos para:
 * 1. Verificar violações de integridade na view job_integrity_violations
 * 2. Criar alertas P0 se houver violações
 * 3. Validar supply chain de agent_releases
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const startTime = Date.now()
    console.log('[integrity-sentinel] Starting integrity check...')

    // ============================================================
    // 1. VERIFICAR VIOLAÇÕES DE INTEGRIDADE via RPC (mais eficiente)
    // Usa a view job_integrity_violations otimizada
    // ============================================================
    const { data: violations, error: violationsError } = await supabase
      .rpc('detect_silent_job_failures')

    if (violationsError) {
      console.error('[integrity-sentinel] Error fetching violations:', violationsError)
    } else if (violations && violations.length > 0) {
      console.error('[integrity-sentinel] 🔴 CRITICAL: Found integrity violations!', {
        count: violations.length,
        violations: violations.map((v: any) => ({
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
          console.log('[integrity-sentinel] Skipping duplicate alert for tenant:', tenantId)
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
              violations: tenantViolations.map((v: any) => ({
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
          console.error('[integrity-sentinel] Error creating alert for tenant:', tenantId, alertError)
        } else {
          console.log('[integrity-sentinel] Created P0 alert for tenant:', tenantId)
        }
      }
    } else {
      console.log('[integrity-sentinel] ✅ No integrity violations found')
    }

    // ============================================================
    // 2. VALIDAR SUPPLY CHAIN (agent_releases)
    // ============================================================
    const { data: releaseIntegrity, error: releaseError } = await supabase
      .rpc('validate_agent_release_integrity')

    if (releaseError) {
      console.error('[integrity-sentinel] Error validating release integrity:', releaseError)
    } else if (releaseIntegrity) {
      const invalidReleases = releaseIntegrity.filter((r: { is_valid: boolean }) => !r.is_valid)
      
      if (invalidReleases.length > 0) {
        console.warn('[integrity-sentinel] ⚠️ Invalid agent releases found:', invalidReleases)
        
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
          console.error('[integrity-sentinel] Error creating release integrity alert:', releaseAlertError)
        }
      } else {
        console.log('[integrity-sentinel] ✅ All agent releases valid')
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
      console.warn('[integrity-sentinel] ⚠️ Jobs completed without output:', {
        count: emptyOutputJobs.length,
        sample: emptyOutputJobs.slice(0, 5)
      })
    }

    const duration = Date.now() - startTime
    console.log('[integrity-sentinel] Check completed', {
      duration_ms: duration,
      violations_found: violations?.length || 0,
      release_issues: releaseIntegrity?.filter((r: { is_valid: boolean }) => !r.is_valid).length || 0,
      empty_output_jobs: emptyOutputJobs?.length || 0
    })

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        violations_found: violations?.length || 0,
        alerts_created: violations && violations.length > 0 ? new Set(violations.map((v: any) => v.tenant_id)).size : 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[integrity-sentinel] Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal error', details: err instanceof Error ? err.message : 'Unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
