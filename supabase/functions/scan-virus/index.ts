import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, corsHeaders } from '../_shared/error-handler.ts';
import { AgentTokenSchema } from '../_shared/validation.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

interface ScanRequest {
  filePath: string;
  fileHash: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const virusTotalApiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
    
    if (!virusTotalApiKey) {
      return new Response(
        JSON.stringify({ error: 'API VirusTotal não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validar token
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Token do agente necessário' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenValidation = AgentTokenSchema.safeParse(agentToken);
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar agente e token
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(agent_name, hmac_secret)')
      .eq('token', agentToken)
      .eq('is_active', true)
      .single();

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents;

    // Verificar HMAC se configurado
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
      if (!hmacResult.valid) {
        return new Response(
          JSON.stringify({ error: hmacResult.error }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'scan-virus', {
      maxRequests: 10,
      windowMinutes: 1,
      blockMinutes: 5,
    });

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit excedido',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atualizar last_used_at do token
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token', agentToken);

    // Parse do body
    const { filePath, fileHash }: ScanRequest = await req.json();

    if (!filePath || !fileHash) {
      return new Response(
        JSON.stringify({ error: 'filePath e fileHash são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${agent.agent_name}] Scanning file: ${filePath} (${fileHash})`);

    // Verificar scan existente recente (últimas 24h)
    const { data: existingScan } = await supabase
      .from('virus_scans')
      .select('*')
      .eq('file_hash', fileHash)
      .gte('scanned_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('scanned_at', { ascending: false })
      .limit(1)
      .single();

    if (existingScan) {
      return new Response(
        JSON.stringify({
          cached: true,
          isMalicious: existingScan.is_malicious,
          positives: existingScan.positives,
          totalScans: existingScan.total_scans,
          permalink: existingScan.virustotal_permalink,
          scannedAt: existingScan.scanned_at,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Consultar VirusTotal API v2 (grátis - 500 req/dia, 4 req/min)
    const vtResponse = await fetch(
      `https://www.virustotal.com/vtapi/v2/file/report?apikey=${virusTotalApiKey}&resource=${fileHash}`
    );

    if (!vtResponse.ok) {
      throw new Error(`VirusTotal API error: ${vtResponse.status}`);
    }

    const vtData = await vtResponse.json();

    // response_code: 1 = encontrado, 0 = não encontrado, -2 = na fila
    if (vtData.response_code === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Arquivo não encontrado no VirusTotal',
          message: 'Envie o arquivo para análise primeiro' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (vtData.response_code === -2) {
      return new Response(
        JSON.stringify({ 
          message: 'Análise em andamento, tente novamente em alguns minutos',
          queued: true 
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const positives = vtData.positives || 0;
    const total = vtData.total || 0;
    const isMalicious = positives > 0;

    // Salvar resultado
    await supabase.from('virus_scans').insert({
      agent_name: agent.agent_name,
      file_hash: fileHash,
      file_path: filePath,
      scan_result: vtData,
      is_malicious: isMalicious,
      positives,
      total_scans: total,
      virustotal_permalink: vtData.permalink,
    });

    return new Response(
      JSON.stringify({
        isMalicious,
        positives,
        totalScans: total,
        permalink: vtData.permalink,
        scanDate: vtData.scan_date,
        scans: vtData.scans,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'scan-virus');
  }
});
