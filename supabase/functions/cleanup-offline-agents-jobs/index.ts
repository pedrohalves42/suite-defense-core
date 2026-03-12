// FASE CORRECAO: Edge function scheduled para cleanup de jobs de agentes offline
// Executa a cada hora para garantir que jobs não fiquem órfãos
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // V-1107: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req)
  if (authError) return authError

  const requestId = crypto.randomUUID()
  console.log(`[${requestId}] cleanup-offline-agents-jobs: Starting scheduled cleanup`)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Chamar função SQL que faz o cleanup
    const { data, error } = await supabase.rpc('cleanup_offline_agents_jobs')

    if (error) {
      console.error(`[${requestId}] Error calling cleanup_offline_agents_jobs:`, error)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message,
          requestId 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = data?.[0] || { cleaned_count: 0, agent_ids: [], job_ids: [] }
    
    console.log(`[${requestId}] Cleanup completed:`, {
      cleanedCount: result.cleaned_count,
      agentIds: result.agent_ids,
      jobIds: result.job_ids
    })

    // Log detalhado se jobs foram cancelados
    if (result.cleaned_count > 0) {
      console.log(`[${requestId}] SUCCESS: Cancelled ${result.cleaned_count} orphaned jobs`)
      console.log(`[${requestId}] Affected agents: ${result.agent_ids?.join(', ')}`)
      console.log(`[${requestId}] Cancelled job IDs: ${result.job_ids?.join(', ')}`)
    } else {
      console.log(`[${requestId}] No orphaned jobs found - system healthy`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        cleaned_count: result.cleaned_count,
        agent_ids: result.agent_ids || [],
        job_ids: result.job_ids || [],
        requestId,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error(`[${requestId}] Unexpected error:`, error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
