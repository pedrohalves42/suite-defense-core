import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { withTimeout } from '../_shared/timeout.ts'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const startedAt = Date.now()
  let alertsCreated = 0

  try {
    await withTimeout(async () => {
      console.log('[check-installation-health] Verificando taxa de falha por tenant...')

      // Get all active tenants
      const { data: tenants, error: tenantsError } = await supabase
        .from('tenants')
        .select('id, name')

      if (tenantsError) {
        console.error('[check-installation-health] Erro ao buscar tenants:', tenantsError)
        return
      }

      if (!tenants || tenants.length === 0) {
        console.log('[check-installation-health] Nenhum tenant encontrado')
        return
      }

      console.log(`[check-installation-health] Verificando ${tenants.length} tenants`)

      for (const tenant of tenants) {
        // Query para taxa de falha nas ultimas 24h para este tenant
        const { data: failureRate, error } = await supabase
          .rpc('get_installation_health_status', { p_tenant_id: tenant.id })

        if (error) {
          console.error(`[check-installation-health] Erro ao buscar health status para tenant ${tenant.id}:`, error)
          continue
        }

        if (!failureRate || failureRate.length === 0) {
          console.log(`[check-installation-health] Tenant ${tenant.name}: nenhum dado de instalacao`)
          continue
        }

        const healthData = failureRate[0]
        const failureRatePct = healthData.failure_rate_pct || 0
        const threshold = healthData.threshold || 30

        console.log(`[check-installation-health] Tenant ${tenant.name}: ${failureRatePct}% (threshold: ${threshold}%)`)

        // Criar alerta se exceder threshold
        if (failureRatePct > threshold) {
          console.log(`[check-installation-health] ALERTA: Tenant ${tenant.name} - Taxa de falha excedeu threshold!`)

          const { error: alertError } = await supabase
            .from('system_alerts')
            .insert({
              severity: 'high',
              alert_type: 'installation_failure',
              title: 'Alta taxa de falha em instalacoes',
              message: `Taxa de falha de instalacao: ${failureRatePct}% (threshold: ${threshold}%)`,
              details: healthData,
              tenant_id: tenant.id
            })

          if (alertError) {
            console.error(`[check-installation-health] Erro ao criar alerta para tenant ${tenant.id}:`, alertError)
          } else {
            alertsCreated++
            console.log(`[check-installation-health] Alerta criado para tenant ${tenant.name}`)
          }
        }
      }

      console.log('[check-installation-health] Verificacao concluida')
    }, { timeoutMs: 60000 }) // Increased timeout for multi-tenant processing

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'check-installation-health',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: { success: true, alerts_created: alertsCreated },
      p_processed_count: alertsCreated,
      p_job_source: 'cron'
    })

    return new Response(
      JSON.stringify({ success: true, alerts_created: alertsCreated }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[check-installation-health] Erro:', errorMessage)
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-installation-health',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: errorMessage,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      })
    } catch (e) { console.warn('[check-installation-health] Failed to log job run:', e); }
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
