import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { JobIdSchema, AgentTokenSchema } from '../_shared/validation.ts'
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

    // Extrair ID do job da URL
    const url = new URL(req.url)
    const jobId = url.pathname.split('/').pop()

    // Validar formato do job ID
    const jobIdValidation = JobIdSchema.safeParse(jobId)
    if (!jobIdValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de job ID inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const validatedJobId = jobIdValidation.data

    console.log('ACK job:', validatedJobId, 'por agente:', agent.agent_name)

    // Atualizar status do job
    const { error } = await supabase
      .from('jobs')
      .update({ 
        status: 'done',
        completed_at: new Date().toISOString()
      })
      .eq('id', validatedJobId)
      .eq('agent_name', agent.agent_name)

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Job não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      )
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleError(error, crypto.randomUUID())
  }
})
