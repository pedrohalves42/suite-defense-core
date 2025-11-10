import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException, corsHeaders } from '../_shared/error-handler.ts';
import { AgentTokenSchema } from '../_shared/validation.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { checkQuotaAvailable } from '../_shared/quota.ts';

interface ScanRequest {
  filePath: string;
  fileHash: string;
}

interface ScanResult {
  isMalicious: boolean;
  positives: number;
  totalScans: number;
  permalink?: string;
  scanDate?: string;
  scans?: any;
  scannerUsed: 'hybrid_analysis' | 'virustotal';
}

// Hybrid Analysis API scan
async function scanWithHybridAnalysis(fileHash: string, apiKey: string): Promise<ScanResult | null> {
  try {
    console.log(`[Hybrid Analysis] Scanning hash: ${fileHash}`);
    
    // Query for existing scan report
    const reportResponse = await fetch(
      `https://www.hybrid-analysis.com/api/v2/report/${fileHash}/summary`,
      {
        headers: {
          'api-key': apiKey,
          'User-Agent': 'CyberShield',
        }
      }
    );

    if (reportResponse.status === 404) {
      console.log('[Hybrid Analysis] File not found in database');
      return null;
    }

    if (!reportResponse.ok) {
      const error = await reportResponse.text();
      console.error(`[Hybrid Analysis] API error: ${reportResponse.status} - ${error}`);
      return null;
    }

    const reportData = await reportResponse.json();
    
    // Extract threat level
    const threatScore = reportData.threat_score || 0;
    const verdict = reportData.verdict || 'no specific threat';
    const isMalicious = threatScore >= 50 || verdict.includes('malicious');
    
    console.log(`[Hybrid Analysis] Result: ${verdict} (score: ${threatScore})`);
    
    return {
      isMalicious,
      positives: isMalicious ? threatScore : 0,
      totalScans: 100,
      permalink: `https://www.hybrid-analysis.com/sample/${fileHash}`,
      scanDate: reportData.analysis_start_time,
      scans: reportData,
      scannerUsed: 'hybrid_analysis'
    };
  } catch (error) {
    console.error('[Hybrid Analysis] Scan failed:', error);
    return null;
  }
}

// VirusTotal API scan
async function scanWithVirusTotal(fileHash: string, apiKey: string): Promise<ScanResult | null> {
  try {
    console.log(`[VirusTotal] Scanning hash: ${fileHash}`);
    
    const vtResponse = await fetch(
      `https://www.virustotal.com/vtapi/v2/file/report?apikey=${apiKey}&resource=${fileHash}`
    );

    if (!vtResponse.ok) {
      console.error(`[VirusTotal] API error: ${vtResponse.status}`);
      return null;
    }

    const vtData = await vtResponse.json();

    // response_code: 1 = found, 0 = not found, -2 = queued
    if (vtData.response_code === 0) {
      console.log('[VirusTotal] File not found in database');
      return null;
    }

    if (vtData.response_code === -2) {
      console.log('[VirusTotal] Analysis queued');
      return null;
    }

    const positives = vtData.positives || 0;
    const total = vtData.total || 0;
    const isMalicious = positives > 0;

    console.log(`[VirusTotal] Result: ${positives}/${total} detections`);

    return {
      isMalicious,
      positives,
      totalScans: total,
      permalink: vtData.permalink,
      scanDate: vtData.scan_date,
      scans: vtData.scans,
      scannerUsed: 'virustotal'
    };
  } catch (error) {
    console.error('[VirusTotal] Scan failed:', error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const hybridAnalysisApiKey = Deno.env.get('HYBRID_ANALYSIS_API_KEY');
    const virusTotalApiKey = Deno.env.get('VIRUSTOTAL_API_KEY');
    
    if (!hybridAnalysisApiKey && !virusTotalApiKey) {
      return new Response(
        JSON.stringify({ error: 'Nenhum serviço de scan configurado' }),
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

    // Buscar agente e token com tenant_id
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(agent_name, hmac_secret, tenant_id)')
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
    
    // Validar tenant_id existe
    if (!agent.tenant_id) {
      console.error(`[${requestId}] Agent ${agent.agent_name} has no tenant_id`);
      return new Response(
        JSON.stringify({ error: 'Configuração inválida do agente' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Check scan quota before proceeding
    const quotaCheck = await checkQuotaAvailable(supabase, agent.tenant_id, 'max_scans_per_month');
    
    if (!quotaCheck.allowed) {
      console.log(`[${agent.agent_name}] Scan quota exceeded: ${quotaCheck.current}/${quotaCheck.limit}`);
      return new Response(
        JSON.stringify({ 
          error: quotaCheck.error || 'Quota de scans excedida',
          quotaUsed: quotaCheck.current,
          quotaLimit: quotaCheck.limit
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Try Hybrid Analysis first (primary scanner)
    let scanResult: ScanResult | null = null;
    
    if (hybridAnalysisApiKey) {
      console.log(`[${agent.agent_name}] Trying Hybrid Analysis first...`);
      scanResult = await scanWithHybridAnalysis(fileHash, hybridAnalysisApiKey);
    }
    
    // Fallback to VirusTotal if Hybrid Analysis failed or not configured
    if (!scanResult && virusTotalApiKey) {
      console.log(`[${agent.agent_name}] Falling back to VirusTotal...`);
      scanResult = await scanWithVirusTotal(fileHash, virusTotalApiKey);
    }
    
    // If both failed, return error
    if (!scanResult) {
      return new Response(
        JSON.stringify({ 
          error: 'Arquivo não encontrado em nenhum serviço de scan',
          message: 'Envie o arquivo para análise ou tente novamente mais tarde' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save scan result
    const { data: scanRecord, error: scanError } = await supabase
      .from('virus_scans')
      .insert({
        agent_name: agent.agent_name,
        tenant_id: agent.tenant_id,
        file_hash: fileHash,
        file_path: filePath,
        scan_result: scanResult.scans,
        is_malicious: scanResult.isMalicious,
        positives: scanResult.positives,
        total_scans: scanResult.totalScans,
        virustotal_permalink: scanResult.permalink,
      })
      .select()
      .single();

    if (scanError) {
      console.error('[SCAN-VIRUS] Error storing scan result:', scanError);
    }

    // Auto-quarantine if malicious and enabled
    if (scanResult.isMalicious && scanRecord) {
      console.log(`[SCAN-VIRUS] Malware detected by ${scanResult.scannerUsed}, triggering auto-quarantine`);
      
      try {
        const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
        
        await supabase.functions.invoke('auto-quarantine', {
          headers: {
            'X-Internal-Secret': internalSecret || '',
          },
          body: {
            virus_scan_id: scanRecord.id,
            agent_name: agent.agent_name,
            file_path: filePath,
            file_hash: fileHash,
            positives: scanResult.positives,
            total_scans: scanResult.totalScans
          }
        });
      } catch (quarantineError) {
        console.error('[SCAN-VIRUS] Auto-quarantine failed:', quarantineError);
        // Don't fail the scan if quarantine fails
      }
    }

    return new Response(
      JSON.stringify({
        isMalicious: scanResult.isMalicious,
        positives: scanResult.positives,
        totalScans: scanResult.totalScans,
        permalink: scanResult.permalink,
        scanDate: scanResult.scanDate,
        scans: scanResult.scans,
        scannerUsed: scanResult.scannerUsed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return handleException(error, requestId, 'scan-virus');
  }
});
