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

    let osInfo: any = {}
    try {
      const body = await req.json()
      osInfo = body || {}
    } catch {
      // Body vazio é OK
    }

    // Buscar agente pelo token
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, tenant_id, status)')
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
      status: string
    }

    logger.warn('Heartbeat fallback used (no HMAC)', { 
      agentName: agent.agent_name,
      reason: 'HMAC verification failed or not provided'
    })

    // Registrar telemetria de fallback
    await supabase
      .from('installation_analytics')
      .insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        agent_name: agent.agent_name,
        event_type: 'heartbeat_fallback_no_hmac',
        platform: osInfo.os_type || 'windows',
        success: true,
        metadata: {
          warning: 'Agent using fallback heartbeat without HMAC',
          os_info: osInfo,
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
        }
      })

    // Atualizar agente com heartbeat (mesmo sem HMAC)
    const updateData: any = { 
      last_heartbeat: new Date().toISOString(),
      status: 'active'
    }
    
    if (osInfo.os_type) updateData.os_type = osInfo.os_type
    if (osInfo.os_version) updateData.os_version = osInfo.os_version
    if (osInfo.hostname) updateData.hostname = osInfo.hostname

    await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id)

    // Atualizar token
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', agentToken)

    return new Response(
      JSON.stringify({ 
        ok: true,
        warning: 'Heartbeat accepted but HMAC validation is recommended',
        agent: agent.agent_name,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    logger.error('Error in heartbeat-fallback', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
