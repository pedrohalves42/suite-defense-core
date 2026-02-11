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

      // Normalizar script para Windows
      const normalizeForWindows = (content: string): string => {
        return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
      };
      
      const normalizedScript = normalizeForWindows(forcedRelease.script_content);
      const encoder = new TextEncoder();
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
      // HOTFIX: Comparar SHA256 além da versão para detectar hotfixes com mesmo número
      if (releaseVersionNorm === currentVersionNorm) {
        // Calcular SHA256 do script da release para comparar com o que o agente tem
        const normalizeForWindowsCheck = (content: string): string => {
          return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
        };
        const normalizedCheck = normalizeForWindowsCheck(release.script_content);
        const checkBytes = new TextEncoder().encode(normalizedCheck);
        const checkHashBuffer = await crypto.subtle.digest('SHA-256', checkBytes);
        const checkHashArray = Array.from(new Uint8Array(checkHashBuffer));
        const releaseSha256 = checkHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Get agent's current script SHA256 from last heartbeat or check-agent-updates
        const agentScriptHash = req.headers.get('X-Script-SHA256') || req.headers.get('X-Current-SHA256');
        
        if (agentScriptHash && agentScriptHash.toLowerCase() !== releaseSha256.toLowerCase()) {
          logger.warn('[serve-agent-update] SHA256 MISMATCH: Same version but different script content (hotfix detected)', {
            requestId,
            agentName: agent.agent_name,
            version: agent.agent_version,
            agentSha256: agentScriptHash.substring(0, 16) + '...',
            releaseSha256: releaseSha256.substring(0, 16) + '...',
            note: 'Delivering hotfix with same version number'
          });
          // Continue to deliver the updated script (don't return early)
        } else if (!agentScriptHash) {
          // Agent doesn't send SHA256 header - check if release SHA differs from stored
          // For agents without SHA256 header, force delivery if release was updated recently (last 24h)
          const releaseAge = Date.now() - new Date(release.created_at).getTime();
          const isRecentRelease = releaseAge < 24 * 60 * 60 * 1000; // 24 hours
          
          if (isRecentRelease) {
            logger.info('[serve-agent-update] Recent release detected, delivering to agent without SHA256 header', {
              requestId,
              agentName: agent.agent_name,
              version: agent.agent_version,
              releaseAge: Math.round(releaseAge / 1000 / 60) + ' minutes',
              releaseSha256: releaseSha256.substring(0, 16) + '...'
            });
            // Continue to deliver the updated script
          } else {
            logger.info('[serve-agent-update] Agente ja esta atualizado (version match, no SHA256 header, release not recent)', { 
              requestId, 
              agentName: agent.agent_name,
              version: agent.agent_version,
              releaseVersion: release.version
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
        } else {
          logger.info('[serve-agent-update] Agente ja esta atualizado (version + SHA256 match)', { 
            requestId, 
            agentName: agent.agent_name,
            version: agent.agent_version,
            sha256Match: true
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
      }
    }

    // Verificar se script_content e placeholder (< 1000 bytes = placeholder)
    let finalScriptContent = release.script_content;
    
    if (!release.script_content || release.script_content.length < 1000) {
      logger.warn('[serve-agent-update] Script no banco e placeholder, tentando buscar do storage', { 
        requestId, 
        dbScriptSize: release.script_content?.length || 0
      });
      
      // Tentar buscar do storage bucket
      if (platform === 'windows') {
        try {
          const { data: fileData, error: storageError } = await supabase.storage
            .from('agent-installers')
            .download('scripts/cybershield-agent-windows-v3.ps1');
          
          if (!storageError && fileData) {
            finalScriptContent = await fileData.text();
            logger.info('[serve-agent-update] Script carregado do storage', {
              requestId,
              size: finalScriptContent.length
            });
          }
        } catch (storageErr) {
          logger.error('[serve-agent-update] Falha ao buscar script do storage', {
            requestId,
            error: storageErr
          });
        }
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
