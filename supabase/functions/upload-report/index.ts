import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { UploadReportSchema, validateFileSize, AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, handleValidationError, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()
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

    // Buscar agente pelo token na tabela dedicada
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(agent_name, hmac_secret)')
      .eq('token', agentToken)
      .eq('is_active', true)
      .single()

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents
    
    // Verificar HMAC se configurado
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
      if (!hmacResult.valid) {
        return new Response(
          JSON.stringify({ error: hmacResult.error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'upload-report', {
      maxRequests: 10,
      windowMinutes: 1,
      blockMinutes: 10,
    })

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit excedido',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Atualizar last_used_at do token
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', agentToken)

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

    // Validar inputs
    const validation = UploadReportSchema.safeParse({
      kind,
      filename: file.name
    })

    if (!validation.success) {
      return handleValidationError(validation.error, requestId)
    }

    // Validar tamanho do arquivo
    if (!validateFileSize(file.size)) {
      return new Response(
        JSON.stringify({ error: 'Arquivo muito grande (máximo 10MB)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 413 }
      )
    }

    // Usar filename sanitizado
    const sanitizedFilename = validation.data.filename
    const sanitizedKind = validation.data.kind

    console.log('Upload de relatório:', sanitizedKind, 'por agente:', agent.agent_name)

    // Ler conteúdo do arquivo
    const fileContent = await file.text()

    // Salvar relatório no banco
    const { data: report, error } = await supabase
      .from('reports')
      .insert({
        agent_name: agent.agent_name,
        kind: sanitizedKind,
        file_path: sanitizedFilename,
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
    return handleException(error, requestId, 'upload-report')
  }
})
