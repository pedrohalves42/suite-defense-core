import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { logger } from '../_shared/logger.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Agent token required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Buscar agente pelo token
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, tenant_id)')
      .eq('token', agentToken)
      .eq('is_active', true)
      .maybeSingle()

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const agent = token.agents as unknown as { 
      id: string
      agent_name: string
      tenant_id: string
    }

    const body = await req.json()
    const { logs, log_type, severity, timestamp } = body

    // Salvar logs em installation_analytics para rastreamento
    const { error: insertError } = await supabase
      .from('installation_analytics')
      .insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        agent_name: agent.agent_name,
        event_type: 'agent_diagnostic_log',
        platform: 'windows',
        success: severity !== 'error',
        metadata: {
          log_type,
          severity,
          logs: Array.isArray(logs) ? logs : [logs],
          uploaded_at: timestamp || new Date().toISOString()
        }
      })

    if (insertError) {
      logger.error('Failed to save agent logs', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save logs' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    logger.info('Agent logs received', { 
      agentName: agent.agent_name, 
      logType: log_type,
      severity 
    })

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message: 'Logs received',
        agent: agent.agent_name 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    logger.error('Error in diagnostics-agent-logs', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
