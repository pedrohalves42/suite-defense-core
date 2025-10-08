import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verificar token do agente
    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Token do agente necessário' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Buscar agente pelo token
    const { data: agent } = await supabase
      .from('agents')
      .select('agent_name')
      .eq('agent_token', agentToken)
      .single()

    if (!agent) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    console.log('Agente polling:', agent.agent_name)

    // Atualizar heartbeat
    await supabase
      .from('agents')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('agent_token', agentToken)

    // Buscar jobs pendentes (máx 3)
    const { data: jobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('agent_name', agent.agent_name)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(3)

    // Marcar jobs como entregues
    if (jobs && jobs.length > 0) {
      const jobIds = jobs.map(j => j.id)
      await supabase
        .from('jobs')
        .update({ 
          status: 'delivered',
          delivered_at: new Date().toISOString()
        })
        .in('id', jobIds)
    }

    // Retornar jobs
    const jobsResponse = (jobs || []).map(j => ({
      id: j.id,
      type: j.type,
      payload: j.payload,
      approved: j.approved
    }))

    return new Response(
      JSON.stringify(jobsResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Erro no polling:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
