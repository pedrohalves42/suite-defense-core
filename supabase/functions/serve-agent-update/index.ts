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

    // ============================================================
    // ROLLOUT GRADUAL: Verificar policy antes de enviar update
    // ============================================================
    const { data: rolloutPolicy } = await supabase
      .from('agent_update_policies')
      .select('*')
      .eq('platform', platform)
      .eq('enabled', true)
      .single();

    if (rolloutPolicy) {
      // Calcular bucket determinístico via SHA256(agent_id)
      const agentIdHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(agent.id)
      );
      const hashArray = Array.from(new Uint8Array(agentIdHash));
      // Usar primeiros 2 bytes para bucket (0-255) mod 100
      const bucket = ((hashArray[0] << 8) | hashArray[1]) % 100;
      
      if (bucket >= rolloutPolicy.rollout_percentage) {
        logger.info('[serve-agent-update] Agente fora do rollout', { 
          requestId, 
          agentName: agent.agent_name,
          bucket,
          rolloutPercentage: rolloutPolicy.rollout_percentage,
          targetVersion: rolloutPolicy.target_version
        });
        return new Response(
          JSON.stringify({ 
            message: 'No update available (outside rollout)',
            current_version: agent.agent_version,
            rollout_bucket: bucket,
            rollout_percentage: rolloutPolicy.rollout_percentage
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      logger.info('[serve-agent-update] Agente dentro do rollout', { 
        requestId, 
        agentName: agent.agent_name,
        bucket,
        rolloutPercentage: rolloutPolicy.rollout_percentage
      });
    }

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

    // ============================================================
    // KILL-SWITCH: Detectar agentes legados (v3.10.37, v3.10.39)
    // Estes agentes têm path hardcoded que impede auto-update real.
    // Forçar envio do script v3.10.40 para que seja salvo em disco
    // e carregado após reboot do Windows.
    // ============================================================
    const legacyVersions = ['3.10.37', '3.10.39', '3.10.14'];
    const isLegacyAgent = legacyVersions.some(v => currentVersionNorm.includes(v));
    
    if (isLegacyAgent) {
      logger.warn('[serve-agent-update] KILL-SWITCH: Legacy agent detected, forcing update delivery', { 
        requestId, 
        agentName: agent.agent_name,
        currentVersion: agent.agent_version,
        targetVersion: release.version,
        note: 'Script will be saved to disk and loaded after Windows reboot'
      });
      // Continua o fluxo para enviar script mesmo se versões parecerem iguais
    } else {
      // Verificar se ja esta na ultima versao (apenas para agentes não-legados)
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
    // VERSION-AWARE SHA256 SERVING
    // Different agent versions calculate SHA256 differently:
    // - v3.10.37 and earlier: UTF-8 without BOM, WriteAllText
    // - v3.10.39: Base64 decode + WriteAllBytes, but with specific normalization
    // - v3.10.40+: Base64 decode + WriteAllBytes with full CRLF normalization
    // ============================================================
    
    // Usa SHA256 do banco - calculado no momento do registro da release
    const storedSha256 = release.sha256;
    
    // Normalizar para CRLF (Windows)
    const normalizeForWindows = (content: string): string => {
      return content
        .replace(/\r\n/g, '\n')   
        .replace(/\r/g, '\n')     
        .replace(/\n/g, '\r\n');  
    };
    
    const normalizedScript = normalizeForWindows(finalScriptContent);
    const encoder = new TextEncoder();
    const scriptBytes = encoder.encode(normalizedScript);
    
    // SHA256 dos bytes normalizados (calculado dinamicamente)
    const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // ============================================================
    // UNIFIED SHA256 - Use dynamically calculated hash for ALL agents
    // v3.10.39+ agents all use the same calculation method (Base64 decode + WriteAllBytes)
    // The hash is calculated from CRLF-normalized bytes, matching what agents calculate
    // ============================================================
    const base64Sha256 = calculatedSha256;
    const legacySha256 = calculatedSha256;  // Use same calculated hash for backward compat
    
    // Base64 dos bytes normalizados
    const base64Script = encodeBase64(scriptBytes);

    logger.info('[serve-agent-update] Script preparado para update', { 
      requestId, 
      agentName: agent.agent_name,
      fromVersion: agent.agent_version,
      toVersion: release.version,
      originalSize: finalScriptContent.length,
      storedSha256: storedSha256.substring(0, 16) + '...',
      legacySha256: legacySha256.substring(0, 16) + '...',
      base64Sha256: base64Sha256.substring(0, 16) + '...',
      base64Size: base64Script.length
    });

    return new Response(
      JSON.stringify({
        version: release.version,
        // BACKWARD COMPATIBLE: script_content como string + SHA256 do banco
        // Agentes v3.10.37 e anteriores usam isso
        script_content: finalScriptContent,      // ← Script original (sem normalização runtime)
        sha256: legacySha256,                    // ← SHA256 com override para v3.10.39
        // NOVO: Para agentes v3.10.39+ que suportam Base64
        script_content_base64: base64Script,     // ← Base64 dos bytes CRLF-normalizados
        sha256_base64: base64Sha256,             // ← SHA256 dos bytes Base64
        release_notes: release.release_notes,
        platform: platform,
        current_version: agent.agent_version,
        // KILL-SWITCH: Flag para indicar agente legado
        legacy_agent_detected: isLegacyAgent,
        self_healing_note: isLegacyAgent ? 'Script saved to disk. New version active after Windows reboot.' : null
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
