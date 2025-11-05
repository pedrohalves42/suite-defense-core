import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleError, corsHeaders } from '../_shared/errors.ts'

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

    // Validar formato do token
    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
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

    console.log('Listando relatórios para agente:', agent.agent_name)

    // Buscar relatórios do agente (últimos 50)
    const { data: reports } = await supabase
      .from('reports')
      .select('id, kind, file_path, created_at')
      .eq('agent_name', agent.agent_name)
      .order('created_at', { ascending: false })
      .limit(50)

    const reportsResponse = (reports || []).map(r => ({
      id: r.id,
      kind: r.kind,
      file: r.file_path,
      createdUtc: r.created_at
    }))

    return new Response(
      JSON.stringify(reportsResponse),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleError(error, crypto.randomUUID())
  }
})
