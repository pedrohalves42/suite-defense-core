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

    // Processar multipart form
    const formData = await req.formData()
    const kind = formData.get('kind') as string
    const file = formData.get('file') as File

    if (!kind || !file) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios faltando' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    console.log('Upload de relatório:', kind, 'por agente:', agent.agent_name)

    // Ler conteúdo do arquivo
    const fileContent = await file.text()

    // Salvar relatório no banco
    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        agent_name: agent.agent_name,
        kind,
        file_path: file.name,
        file_data: fileContent
      })
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({
        id: report.id,
        kind: report.kind,
        agentName: report.agent_name,
        createdUtc: report.created_at,
        file: report.file_path
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 201
      }
    )
  } catch (error) {
    console.error('Erro ao fazer upload de relatório:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro desconhecido' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
