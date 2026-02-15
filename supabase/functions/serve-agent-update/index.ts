import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { AGENT_SCRIPT_WINDOWS_CONTENT } from '../_shared/agent-script-windows-content.ts';
import { AGENT_SCRIPT_LINUX_SH } from '../_shared/agent-script-linux-content.ts';
import { AGENT_SCRIPT_MACOS_SH } from '../_shared/agent-script-macos-content.ts';
import { INSTALLER_VERSION } from '../_shared/installer-version.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { updateDecisionService, normalizeVersion, normalizeForWindows, calculateSha256 } from '../_shared/hexagonal/update-decision-service.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[serve-agent-update] Requisicao recebida', { requestId });

    // Token authentication with HMAC fallback for pre-hotfix agents
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      logger.warn('[serve-agent-update] Missing X-Agent-Token', { requestId });
      return new Response(
        JSON.stringify({ error: 'Missing agent token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar token e agente via hash (P0 security fix)
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, is_active, agents!inner(id, agent_name, hmac_secret, agent_version, os_type, force_update_version, force_update_reason)')
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
      force_update_version: string | null;
      force_update_reason: string | null;
    };

    // COMPAT: HMAC verification with token-only fallback for pre-hotfix agents
    // Pre-hotfix v5.0.3 agents call serve-agent-update without HMAC headers
    const signature = req.headers.get('X-HMAC-Signature');
    const timestamp = req.headers.get('X-Timestamp') || req.headers.get('X-HMAC-Timestamp');
    const nonce = req.headers.get('X-Nonce') || req.headers.get('X-HMAC-Nonce');
    const hasAnyHmacHeader = !!(signature || timestamp || nonce);

    if (hasAnyHmacHeader && agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(
        supabase, req, agent.agent_name, agent.hmac_secret
      );
      if (!hmacResult.valid) {
        // Accept with token-only auth if HMAC fails (encoding bugs in pre-hotfix agents)
        logger.warn('[serve-agent-update] HMAC failed but accepting (token-authenticated)', { 
          requestId, agentName: agent.agent_name, errorCode: hmacResult.errorCode
        });
      } else {
        logger.debug('[serve-agent-update] HMAC verified', { requestId, agentName: agent.agent_name });
      }
    } else {
      // No HMAC headers - pre-hotfix agent authenticated by token only
      logger.warn('[serve-agent-update] Accepted without HMAC (token-only auth, pre-hotfix agent)', { 
        requestId, agentName: agent.agent_name
      });
    }

    logger.info('[serve-agent-update] Agent authenticated', { 
      requestId, 
      agentName: agent.agent_name,
      currentVersion: agent.agent_version,
      authMethod: hasAnyHmacHeader ? 'hmac' : 'token-only'
    });

    // Determinar plataforma
    const platform = agent.os_type?.toLowerCase() || 'windows';

    // ============================================================
    // FORCE UPDATE: Prioridade absoluta - bypassa rollout e jobs
    // ============================================================
    if (agent.force_update_version) {
      logger.info('[serve-agent-update] FORCE UPDATE detectado', { 
        requestId, 
        agentName: agent.agent_name,
        currentVersion: agent.agent_version,
        forceVersion: agent.force_update_version,
        reason: agent.force_update_reason
      });

      // Buscar release forçada
      const { data: forcedRelease, error: forcedError } = await supabase
        .from('agent_releases')
        .select('version, script_content, sha256, release_notes, signature_base64, signed_at, signed_by')
        .eq('version', agent.force_update_version)
        .eq('platform', platform)
        .eq('is_active', true)
        .single();

      if (forcedError || !forcedRelease) {
        logger.error('[serve-agent-update] Force update version not found', { 
          requestId, 
          forceVersion: agent.force_update_version,
          platform 
        });
        // Limpar force_update se versão não existe
        await supabase
          .from('agents')
          .update({ 
            force_update_version: null, 
            force_update_reason: null, 
            force_update_at: null 
          })
          .eq('id', agent.id);
        
        return new Response(
          JSON.stringify({ 
            error: 'Forced version not found',
            force_update_version: agent.force_update_version
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // SAFETY: Reject HTML content from DB (corrupted releases)
      if (forcedRelease.script_content?.trimStart().startsWith('<!DOCTYPE') || forcedRelease.script_content?.trimStart().startsWith('<html')) {
        logger.error('[serve-agent-update] Force update script is corrupted HTML', {
          requestId,
          forceVersion: agent.force_update_version,
          preview: forcedRelease.script_content.substring(0, 100),
        });
        return new Response(
          JSON.stringify({ error: 'Script content corrupted (HTML)', version: agent.force_update_version }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Normalizar script para Windows (via hexagonal shared module)
      
      const normalizedScript = normalizeForWindows(forcedRelease.script_content);
      const scriptBytes = encoder.encode(normalizedScript);
      const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      const base64Script = encodeBase64(scriptBytes);

      logger.info('[serve-agent-update] FORCE UPDATE: Enviando script', { 
        requestId, 
        agentName: agent.agent_name,
        fromVersion: agent.agent_version,
        toVersion: forcedRelease.version,
        reason: agent.force_update_reason
      });

      return new Response(
        JSON.stringify({
          version: forcedRelease.version,
          script_content: forcedRelease.script_content,
          sha256: calculatedSha256,
          script_content_base64: base64Script,
          sha256_base64: calculatedSha256,
          signature_base64: forcedRelease.signature_base64 || null,
          signed_at: forcedRelease.signed_at || null,
          signed_by: forcedRelease.signed_by || null,
          release_notes: forcedRelease.release_notes,
          platform: platform,
          current_version: agent.agent_version,
          // FLAGS ESPECIAIS PARA FORCE UPDATE
          force_update: true,
          bypass_jobs: true,
          force_update_reason: agent.force_update_reason
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================
    // ROLLOUT GRADUAL: Verificar policy antes de enviar update
    // ============================================================
    const { data: rolloutPolicy } = await supabase
      .from('agent_update_policies')
      .select('*')
      .eq('platform', platform)
      .eq('enabled', true)
      .single();

    // Calcular bucket determinístico via SHA256(agent_id) - sempre calculamos para telemetria
    const agentIdHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(agent.id)
    );
    const bucketHashArray = Array.from(new Uint8Array(agentIdHash));
    const bucket = ((bucketHashArray[0] << 8) | bucketHashArray[1]) % 100;

    // Função helper para registrar decisão de rollout
    const logRolloutDecision = async (decision: 'allowed' | 'skipped' | 'no_policy' | 'already_current' | 'force_update', targetVersion: string, rolloutPercentage: number) => {
      try {
        await supabase.from('agent_update_decisions').insert({
          agent_id: agent.id,
          agent_name: agent.agent_name,
          platform,
          target_version: targetVersion,
          bucket,
          rollout_percentage: rolloutPercentage,
          decision,
          current_version: agent.agent_version
        });
      } catch (err) {
        logger.warn('[serve-agent-update] Failed to log rollout decision', { requestId, error: err });
      }
    };

    if (rolloutPolicy) {
      if (bucket >= rolloutPolicy.rollout_percentage) {
        logger.info('[serve-agent-update] Agente fora do rollout', { 
          requestId, 
          agentName: agent.agent_name,
          bucket,
          rolloutPercentage: rolloutPolicy.rollout_percentage,
          targetVersion: rolloutPolicy.target_version
        });
        
        // TELEMETRIA: Registrar decisão "skipped"
        await logRolloutDecision('skipped', rolloutPolicy.target_version, rolloutPolicy.rollout_percentage);
        
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

    // Buscar ultima release ativa (incluindo assinatura criptográfica)
    const { data: release, error: releaseError } = await supabase
      .from('agent_releases')
      .select('version, script_content, sha256, release_notes, created_at, signature_base64, signed_at, signed_by')
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

    // Normalizar versoes via UpdateDecisionService (hexagonal)
    const legacyVersions = ['3.10.37', '3.10.39', '3.10.14'];
    const currentVersionNorm = normalizeVersion(agent.agent_version);
    const isLegacyAgent = legacyVersions.some(v => currentVersionNorm.includes(v));
    
    if (isLegacyAgent) {
      logger.warn('[serve-agent-update] KILL-SWITCH: Legacy agent detected, forcing update delivery', { 
        requestId, 
        agentName: agent.agent_name,
        currentVersion: agent.agent_version,
        targetVersion: release.version,
        note: 'Script will be saved to disk and loaded after Windows reboot'
      });
    } else {
      // Use hexagonal UpdateDecisionService for version/hotfix comparison
      const decision = await updateDecisionService.evaluate(
        {
          agentId: agent.id,
          agentName: agent.agent_name,
          currentVersion: agent.agent_version,
          currentScriptSha256: req.headers.get('X-Script-SHA256') || req.headers.get('X-Current-SHA256'),
          platform,
        },
        {
          version: release.version,
          scriptContent: release.script_content,
          sha256: release.sha256,
          releaseNotes: release.release_notes,
          createdAt: release.created_at,
        },
      );

      if (decision.action === 'no_update') {
        logger.info('[serve-agent-update] Agent up to date (via UpdateDecisionService)', { 
          requestId, 
          agentName: agent.agent_name,
          version: agent.agent_version,
          reason: decision.reason,
        });
        
        await logRolloutDecision('already_current', release.version, rolloutPolicy?.rollout_percentage || 100);
        
        return new Response(
          JSON.stringify({ 
            message: 'Already up to date',
            current_version: agent.agent_version 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      logger.info('[serve-agent-update] Update decision', {
        requestId,
        agentName: agent.agent_name,
        action: decision.action,
        fromVersion: agent.agent_version,
        toVersion: release.version,
      });
    }

    // AUTHORITATIVE SOURCE: Use codebase scripts for ALL platforms (always up-to-date with hotfixes)
    // The script files in _shared/agent-scripts/ are the single source of truth
    // This eliminates the agent_releases sync gap that caused hotfix delivery failures
    let finalScriptContent = release.script_content;
    
    // SAFETY: Reject HTML content from DB (corrupted releases)
    if (finalScriptContent && (finalScriptContent.trimStart().startsWith('<!DOCTYPE') || finalScriptContent.trimStart().startsWith('<html'))) {
      logger.error('[serve-agent-update] DB script_content is corrupted HTML, rejecting', {
        requestId,
        platform,
        preview: finalScriptContent.substring(0, 100),
      });
      finalScriptContent = '';  // Force fallback to codebase
    }
    
    const codebaseScripts: Record<string, string> = {
      windows: AGENT_SCRIPT_WINDOWS_CONTENT,
      linux: AGENT_SCRIPT_LINUX_SH,
      macos: AGENT_SCRIPT_MACOS_SH,
    };
    
    const codebaseScript = codebaseScripts[platform];
    if (codebaseScript && codebaseScript.length > 1000) {
      const codebaseLen = codebaseScript.length;
      const dbLen = finalScriptContent?.length || 0;
      if (codebaseLen !== dbLen) {
        logger.info('[serve-agent-update] Using codebase script (authoritative) instead of DB', {
          requestId,
          platform,
          codebaseSize: codebaseLen,
          dbSize: dbLen,
          agentName: agent.agent_name
        });
      }
      finalScriptContent = codebaseScript;
    } else if (!finalScriptContent || finalScriptContent.length < 1000) {
      logger.warn('[serve-agent-update] No valid script in codebase or DB', { 
        requestId, 
        platform,
        dbScriptSize: release.script_content?.length || 0
      });
    }
    
    // Se ainda não temos script válido, retornar erro
    if (!finalScriptContent || finalScriptContent.length < 1000) {
      logger.error('[serve-agent-update] Nenhum script válido disponível', { requestId });
      return new Response(
        JSON.stringify({ 
          error: 'No valid script available',
          message: 'Script content not found in database or storage'
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    
    // Normalizar para CRLF (Windows) via hexagonal shared module
    
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

    // TELEMETRIA: Registrar decisão "allowed" (update será enviado)
    await logRolloutDecision('allowed', release.version, rolloutPolicy?.rollout_percentage || 100);

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
        // FASE 2: Assinatura criptográfica Ed25519
        signature_base64: release.signature_base64 || null,
        signed_at: release.signed_at || null,
        signed_by: release.signed_by || null,
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
