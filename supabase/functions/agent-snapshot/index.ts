import { serve } from "https://deno.land/std@0.203.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from '../_shared/cors.ts'
import { logger } from '../_shared/logger.ts';

/**
 * agent-snapshot - Edge Function Canônica
 * 
 * Retorna snapshot único e consistente do agente.
 * Fonte única de verdade para todas as UIs (Monitoramento, Diagnóstico, Central de Ações).
 * 
 * Garantias:
 * - Tenant isolado via RLS
 * - Correlation ID para debug
 * - Erros claros (sem falha silenciosa)
 */

serve(async (req) => {
  const correlationId = crypto.randomUUID()

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Apenas POST
    if (req.method !== 'POST') {
      return jsonError(405, 'Method not allowed', correlationId)
    }

    // Cliente com contexto do usuário
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonError(401, 'Missing authorization header', correlationId)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Autenticação
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      logger.error('[agent-snapshot][AUTH_ERROR]', { authError, correlationId })
      return jsonError(401, 'Unauthorized', correlationId)
    }

    // Parse body
    let body: { agent_id?: string }
    try {
      body = await req.json()
    } catch {
      return jsonError(400, 'Invalid JSON body', correlationId)
    }

    const { agent_id } = body
    if (!agent_id) {
      return jsonError(400, 'agent_id is required', correlationId)
    }

    // Validar formato UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(agent_id)) {
      return jsonError(400, 'Invalid agent_id format', correlationId)
    }

    // Chamada RPC (fonte única de verdade)
    const { data: snapshot, error: rpcError } = await supabase
      .rpc('get_agent_snapshot', { p_agent_id: agent_id })

    if (rpcError) {
      logger.error('[agent-snapshot][RPC_ERROR]', { rpcError, agent_id, correlationId })
      return jsonError(500, 'Failed to fetch agent snapshot', correlationId)
    }

    if (!snapshot) {
      return jsonError(404, 'Agent not found or access denied', correlationId)
    }

    // Resposta padronizada
    return new Response(
      JSON.stringify({
        data: {
          ...snapshot,
          meta: { 
            correlation_id: correlationId, 
            snapshot_at: new Date().toISOString() 
          }
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (err) {
    logger.error('[agent-snapshot][UNHANDLED_ERROR]', { err, correlationId })
    return jsonError(500, 'Unexpected error', correlationId)
  }
})

function jsonError(status: number, message: string, correlationId: string) {
  return new Response(
    JSON.stringify({ error: message, correlation_id: correlationId }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
