import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verificar autenticação admin
    const adminSecret = req.headers.get('X-Admin-Secret')
    if (adminSecret !== 'DEV-ADMIN') {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { agentName, type, payload, approved = true } = await req.json()

    console.log('Criando job:', { agentName, type })

    if (!agentName || !type) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios faltando' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Criar job
    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        agent_name: agentName,
        type,
        payload: payload || {},
        approved,
        status: 'queued'
      })
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({
        id: job.id,
        type: job.type,
        agentName: job.agent_name
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Erro ao criar job:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
