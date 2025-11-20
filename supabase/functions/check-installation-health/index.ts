import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { withTimeout } from '../_shared/timeout.ts'

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    await withTimeout(async () => {
      console.log('[check-installation-health] Verificando taxa de falha...')

      // Query para taxa de falha nas ultimas 24h
      const { data: failureRate, error } = await supabase
        .rpc('get_installation_health_status')

      if (error) {
        console.error('[check-installation-health] Erro ao buscar health status:', error)
        return
      }

      if (!failureRate || failureRate.length === 0) {
        console.log('[check-installation-health] Nenhum dado de instalacao disponivel')
        return
      }

      const healthData = failureRate[0]
      const failureRatePct = healthData.failure_rate_pct || 0
      const threshold = healthData.threshold || 30

      console.log(`[check-installation-health] Taxa de falha: ${failureRatePct}% (threshold: ${threshold}%)`)

      // Criar alerta se exceder threshold
      if (failureRatePct > threshold) {
        console.log(`[check-installation-health] ALERTA: Taxa de falha excedeu threshold!`)

        const { error: alertError } = await supabase
          .from('system_alerts')
          .insert({
            severity: 'high',
            alert_type: 'installation_failure',
            title: 'Alta taxa de falha em instalacoes',
            message: `Taxa de falha de instalacao: ${failureRatePct}% (threshold: ${threshold}%)`,
            details: healthData,
            tenant_id: '00000000-0000-0000-0000-000000000000' // System-level alert
          })

        if (alertError) {
          console.error('[check-installation-health] Erro ao criar alerta:', alertError)
        } else {
          console.log('[check-installation-health] Alerta criado com sucesso')
        }
      } else {
        console.log('[check-installation-health] Health OK - sem alertas')
      }
    }, { timeoutMs: 20000 })

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[check-installation-health] Erro:', errorMessage)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
