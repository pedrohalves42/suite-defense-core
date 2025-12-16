import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { AGENT_SCRIPT_WINDOWS_CONTENT } from '../_shared/agent-script-windows-content.ts';
import { INSTALLER_VERSION } from '../_shared/installer-version.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[serve-agent-update] Requisicao recebida', { requestId });

    // Verificar HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    const signature = req.headers.get('X-HMAC-Signature');
    const timestamp = req.headers.get('X-Timestamp');
    const nonce = req.headers.get('X-Nonce');

    if (!agentToken || !signature || !timestamp || !nonce) {
      logger.warn('[serve-agent-update] Headers HMAC ausentes', { requestId });
      return new Response(
        JSON.stringify({ error: 'Missing HMAC headers' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar token e agente via hash (P0 security fix)
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, is_active, agents!inner(id, agent_name, hmac_secret, agent_version, os_type)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      logger.error('[serve-agent-update] Token invalido ou agente nao encontrado', { 
        requestId, 
        agentToken: agentToken.substring(0, 8) + '...',
        error: tokenError 
      });
      return new Response(
        JSON.stringify({ error: 'Invalid token or agent not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const agent = (tokenData as any).agents as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string; 
      agent_version: string | null; 
      os_type: string | null;
    };

    // Verificar HMAC
    const hmacResult = await verifyHmacSignature(
      supabase,
      req,
      agent.agent_name,
      agent.hmac_secret
    );

    if (!hmacResult.valid) {
      logger.warn('[serve-agent-update] HMAC invalido', { 
        requestId, 
        agentName: agent.agent_name,
        errorCode: hmacResult.errorCode
      });
      return new Response(
        JSON.stringify({ error: 'Invalid HMAC signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[serve-agent-update] HMAC valido', { 
      requestId, 
      agentName: agent.agent_name,
      currentVersion: agent.agent_version 
    });

    // Determinar plataforma
    const platform = agent.os_type?.toLowerCase() || 'windows';

    // Buscar ultima release ativa
    const { data: release, error: releaseError } = await supabase
      .from('agent_releases')
      .select('version, script_content, sha256, release_notes, created_at')
      .eq('platform', platform)
      .eq('channel', 'stable')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (releaseError || !release) {
      logger.warn('[serve-agent-update] Nenhuma release disponivel', { 
        requestId, 
        platform,
        error: releaseError 
      });
      return new Response(
        JSON.stringify({ 
          error: 'No update available',
          current_version: agent.agent_version 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalizar versoes (remover prefixo "v" para comparacao)
    const normalizeVersion = (v: string | null) => v?.replace(/^v/i, '') || '';
    const currentVersionNorm = normalizeVersion(agent.agent_version);
    const releaseVersionNorm = normalizeVersion(release.version);

    // Verificar se ja esta na ultima versao
    if (releaseVersionNorm === currentVersionNorm) {
      logger.info('[serve-agent-update] Agente ja esta atualizado', { 
        requestId, 
        agentName: agent.agent_name,
        version: agent.agent_version,
        releaseVersion: release.version,
        normalized: { current: currentVersionNorm, release: releaseVersionNorm }
      });
      return new Response(
        JSON.stringify({ 
          message: 'Already up to date',
          current_version: agent.agent_version 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se script_content e placeholder (< 1000 bytes = placeholder)
    let finalScriptContent = release.script_content;
    
    if (!release.script_content || release.script_content.length < 1000) {
      logger.warn('[serve-agent-update] Script no banco e placeholder, usando embedded', { 
        requestId, 
        dbScriptSize: release.script_content?.length || 0,
        embeddedScriptSize: AGENT_SCRIPT_WINDOWS_CONTENT.length
      });
      
      // Usar script embedded como fallback
      if (platform === 'windows' && AGENT_SCRIPT_WINDOWS_CONTENT) {
        finalScriptContent = AGENT_SCRIPT_WINDOWS_CONTENT;
      }
    }

    // ============================================================
    // CRITICAL: Normalizar line endings para Windows (CRLF)
    // e calcular SHA256 do conteúdo EXATAMENTE como será salvo no disco
    // ============================================================
    const normalizeForWindows = (content: string): string => {
      // Primeiro converte todos os line endings para LF, depois para CRLF
      return content
        .replace(/\r\n/g, '\n')   // Remove CRLF existentes
        .replace(/\r/g, '\n')      // Remove CR soltos
        .replace(/\n/g, '\r\n');   // Converte todos para CRLF
    };

    // Normalizar script para Windows
    const normalizedScript = normalizeForWindows(finalScriptContent);

    // Calcular SHA256 do script NORMALIZADO (verdade absoluta)
    const encoder = new TextEncoder();
    const scriptBytes = encoder.encode(normalizedScript);
    const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // ============================================================
    // BASE64 ENCODING - Industrial-grade usando Deno std lib
    // Zero stack usage, O(n) memória, funciona com Uint8Array de qualquer tamanho
    // ============================================================
    const base64Script = encodeBase64(scriptBytes);

    logger.info('[serve-agent-update] Script normalizado, SHA256 calculado e Base64 gerado', { 
      requestId, 
      agentName: agent.agent_name,
      fromVersion: agent.agent_version,
      toVersion: release.version,
      originalSize: finalScriptContent.length,
      normalizedSize: normalizedScript.length,
      base64Size: base64Script.length,
      sha256: calculatedSha256.substring(0, 16) + '...'
    });

    return new Response(
      JSON.stringify({
        version: release.version,
        script_content: normalizedScript,        // ← Fallback para agentes antigos
        script_content_base64: base64Script,     // ← NOVO: Base64 para agentes v3.10.39+
        sha256: calculatedSha256,                // ← SHA256 dos bytes reais
        release_notes: release.release_notes,
        platform: platform,
        current_version: agent.agent_version
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[serve-agent-update] Erro interno', { 
      requestId, 
      error: err.message,
      stack: err.stack 
    });

    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: err.message,
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
