// FASE 2: Funcao de cleanup de jobs travados
// P1-03 FIX: Adicionada validação de autenticação
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const requestId = crypto.randomUUID()

  // P1-03 FIX: Validate internal secret or scheduled execution
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET')
  const providedSecret = req.headers.get('X-Internal-Secret')
  
  // Allow scheduled execution (no auth) or internal secret
  const isScheduled = !providedSecret && req.headers.get('authorization') === null
  const isInternal = INTERNAL_SECRET && providedSecret === INTERNAL_SECRET
  
  if (!isScheduled && !isInternal) {
    console.warn(`[${requestId}] Unauthorized access attempt to cleanup-stuck-jobs`)
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Timeout: 10 minutos (jobs em "delivered" ha mais de 10min voltam para "queued")
    const timeoutMinutes = 10
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString()

    console.log(`[cleanup-stuck-jobs] Looking for jobs delivered before ${cutoffTime}`)

    // Buscar jobs travados
    const { data: stuckJobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, type, delivered_at')
      .eq('status', 'delivered')
      .lt('delivered_at', cutoffTime)

    if (fetchError) {
      console.error('[cleanup-stuck-jobs] Error fetching stuck jobs:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch stuck jobs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log('[cleanup-stuck-jobs] No stuck jobs found')
      return new Response(
        JSON.stringify({ message: 'No stuck jobs', count: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[cleanup-stuck-jobs] Found ${stuckJobs.length} stuck jobs`)
    console.log('[cleanup-stuck-jobs] Job IDs:', stuckJobs.map(j => j.id))

    // Voltar para queued
    const { error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'queued',
        delivered_at: null
      })
      .in('id', stuckJobs.map(j => j.id))

    if (updateError) {
      console.error('[cleanup-stuck-jobs] Error updating jobs:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update jobs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[cleanup-stuck-jobs] Successfully reset ${stuckJobs.length} jobs to queued`)

    return new Response(
      JSON.stringify({
        success: true,
        count: stuckJobs.length,
        jobs: stuckJobs.map(j => ({ id: j.id, agent: j.agent_name, type: j.type }))
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[cleanup-stuck-jobs] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
