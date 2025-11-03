import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { tenantId, enrollmentKey, agentName } = await req.json()

    console.log('Matriculando agente:', agentName)

    // Validar entrada
    if (!agentName || !enrollmentKey) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios faltando' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Validar chave de enrollment dinâmica
    const { data: keyData, error: keyError } = await supabase
      .from('enrollment_keys')
      .select('*')
      .eq('key', enrollmentKey)
      .eq('is_active', true)
      .single()

    if (keyError || !keyData) {
      console.error('Chave de enrollment inválida:', enrollmentKey)
      return new Response(
        JSON.stringify({ error: 'Chave de matrícula inválida ou expirada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verificar expiração
    if (new Date(keyData.expires_at) < new Date()) {
      console.error('Chave de enrollment expirada:', enrollmentKey)
      
      // Desativar chave expirada
      await supabase
        .from('enrollment_keys')
        .update({ is_active: false })
        .eq('id', keyData.id)

      return new Response(
        JSON.stringify({ error: 'Chave de matrícula expirada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Verificar limite de usos
    if (keyData.current_uses >= keyData.max_uses) {
      console.error('Limite de usos da chave atingido:', enrollmentKey)
      return new Response(
        JSON.stringify({ error: 'Chave de matrícula atingiu o limite de usos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Gerar token único
    const agentToken = crypto.randomUUID()

    // Verificar se agente já existe
    const { data: existing } = await supabase
      .from('agents')
      .select('*')
      .eq('agent_name', agentName)
      .single()

    if (existing) {
      // Atualizar token existente
      await supabase
        .from('agents')
        .update({ agent_token: agentToken })
        .eq('agent_name', agentName)
    } else {
      // Criar novo agente
      await supabase
        .from('agents')
        .insert({
          agent_name: agentName,
          agent_token: agentToken,
          tenant_id: tenantId || 'dev'
        })
    }

    // Atualizar contador de usos da chave
    await supabase
      .from('enrollment_keys')
      .update({ 
        current_uses: keyData.current_uses + 1,
        used_at: new Date().toISOString(),
        used_by_agent: agentName
      })
      .eq('id', keyData.id)

    console.log(`Agente ${agentName} matriculado com sucesso usando chave ${enrollmentKey}`)

    return new Response(
      JSON.stringify({
        agentToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Erro ao matricular agente:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
