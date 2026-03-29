import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts';
// NOTE: Codebase script imports removed - .ps1 files are NOT bundled in Deno Deploy
// All script content is served exclusively from the agent_releases DB table
import { INSTALLER_VERSION } from '../_shared/installer-version.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { updateDecisionService, normalizeVersion, normalizeForWindows, calculateSha256 } from '../_shared/hexagonal/update-decision-service.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

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
      .select('agent_id, is_active, agents!inner(id, agent_name, tenant_id, hmac_secret, agent_version, os_type, force_update_version, force_update_reason)')
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

    const agent = (tokenData as Record<string, unknown>).agents as { 
      id: string; 
      agent_name: string;
      tenant_id: string;
      hmac_secret: string; 
      agent_version: string | null; 
      os_type: string | null;
      force_update_version: string | null;
      force_update_reason: string | null;
    };

    // COMPAT: HMAC verification with token-only fallback for pre-hotfix agents
    // Pre-hotfix v5.0.3 agents call serve-agent-update without HMAC headers
    const signature = req.headers.get('X-HMAC-Signature');
    const timestamp = req.headers.get('X-HMAC-Timestamp') || req.headers.get('X-Timestamp');
    const nonce = req.headers.get('X-HMAC-Nonce') || req.headers.get('X-Nonce');
    const hasAnyHmacHeader = !!(signature || timestamp || nonce);

    if (hasAnyHmacHeader && agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(
        supabase,
        req,
        agent.agent_name,
        agent.hmac_secret,
        {
          agentId: agent.id,
          tenantId: agent.tenant_id,
          endpoint: '/serve-agent-update',
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
        }
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

      // Buscar release forcada
      const { data: forcedRelease, error: forcedError } = await supabase
        .from('agent_releases')
        .select('id, version, script_content, sha256, release_notes, signature_base64, signed_at, signed_by')
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
        // Limpar force_update se versao nao existe
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

      let forcedScriptContent = forcedRelease.script_content;
      if (platform === 'windows' && forcedScriptContent) {
        const hotfix = applyWindowsScriptHotfix(forcedScriptContent);
        if (hotfix.changed) {
          forcedScriptContent = hotfix.content;
          logger.warn('[serve-agent-update] Applied Windows hotfix in force-update path', {
            requestId,
            forceVersion: forcedRelease.version,
            reasons: hotfix.reasons,
          });

          const { error: persistError } = await supabase
            .from('agent_releases')
            .update({ script_content: forcedScriptContent })
            .eq('id', forcedRelease.id);

          if (persistError) {
            logger.warn('[serve-agent-update] Could not persist force-update hotfix', {
              requestId,
              releaseId: forcedRelease.id,
              error: persistError.message,
            });
          }
        }
      }

      // SAFETY: Reject HTML content from DB (corrupted releases)
      if (forcedScriptContent?.trimStart().startsWith('<!DOCTYPE') || forcedScriptContent?.trimStart().startsWith('<html')) {
        logger.error('[serve-agent-update] Force update script is corrupted HTML', {
          requestId,
          forceVersion: agent.force_update_version,
          preview: forcedScriptContent.substring(0, 100),
        });
        return new Response(
          JSON.stringify({ error: 'Script content corrupted (HTML)', version: agent.force_update_version }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Normalizar script para Windows (via hexagonal shared module)
      const normalizedScript = normalizeForWindows(forcedScriptContent);
      const forceEncoder = new TextEncoder();
      const scriptBytes = forceEncoder.encode(normalizedScript);
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

      // Incrementar contador de entregas para detectar loops
      await supabase
        .from('agents')
        .update({ 
          force_update_delivery_count: (await supabase
            .from('agents')
            .select('force_update_delivery_count')
            .eq('id', agent.id)
            .single()).data?.force_update_delivery_count + 1 || 1
        })
        .eq('id', agent.id);

      return new Response(
        JSON.stringify({
          version: forcedRelease.version,
          script_content: forcedScriptContent,
          sha256: calculatedSha256,
          script_sha256: calculatedSha256, // Alias for v5.0.13+ agents
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
          force_update_reason: agent.force_update_reason,
          // CONFIRMATION INSTRUCTIONS (critical for closing the loop)
          confirm_url: `${SUPABASE_URL}/functions/v1/confirm-force-update`,
          confirm_method: 'POST',
          confirm_body_schema: {
            new_version: forcedRelease.version,
            old_version: agent.agent_version || 'unknown'
          },
          confirm_required_headers: ['X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce'],
          confirm_instructions: 'After applying the update and recreating the scheduled task, POST to confirm_url with confirm_body_schema and HMAC headers to clear the force_update flag. Without this call, the update will be re-delivered on next heartbeat.'
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

    // Calcular bucket deterministico via SHA256(agent_id) - sempre calculamos para telemetria
    const agentIdHash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(agent.id)
    );
    const bucketHashArray = Array.from(new Uint8Array(agentIdHash));
    const bucket = ((bucketHashArray[0] << 8) | bucketHashArray[1]) % 100;

    // Funcao helper para registrar decisao de rollout
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
        
        // TELEMETRIA: Registrar decisao "skipped"
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

    // Buscar ultima release ativa (incluindo assinatura criptografica)
    const { data: release, error: releaseError } = await supabase
      .from('agent_releases')
      .select('id, version, script_content, sha256, release_notes, created_at, signature_base64, signed_at, signed_by')
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

    // AUTHORITATIVE SOURCE: Always use DB release content
    // Codebase scripts (.ps1 files) are NOT bundled in Deno Deploy
    let finalScriptContent = release.script_content;

    if (platform === 'windows' && finalScriptContent) {
      const hotfix = applyWindowsScriptHotfix(finalScriptContent);
      if (hotfix.changed) {
        finalScriptContent = hotfix.content;
        logger.warn('[serve-agent-update] Applied Windows hotfix before delivery', {
          requestId,
          releaseVersion: release.version,
          reasons: hotfix.reasons,
        });

        const { error: persistError } = await supabase
          .from('agent_releases')
          .update({ script_content: finalScriptContent })
          .eq('id', release.id);

        if (persistError) {
          logger.warn('[serve-agent-update] Could not persist hotfixed script', {
            requestId,
            releaseId: release.id,
            error: persistError.message,
          });
        }
      }
    }
    
    // SAFETY: Reject HTML content from DB (corrupted releases)
    if (finalScriptContent && (finalScriptContent.trimStart().startsWith('<!DOCTYPE') || finalScriptContent.trimStart().startsWith('<html'))) {
      logger.error('[serve-agent-update] DB script_content is corrupted HTML, rejecting', {
        requestId,
        platform,
        preview: finalScriptContent.substring(0, 100),
      });
      finalScriptContent = '';
    }

    if (!finalScriptContent || finalScriptContent.length < 1000) {
      logger.warn('[serve-agent-update] No valid script content in DB', { 
        requestId, 
        platform,
        dbScriptSize: release.script_content?.length || 0
      });
    }
    
    // Se ainda nao temos script valido, retornar erro
    if (!finalScriptContent || finalScriptContent.length < 1000) {
      logger.error('[serve-agent-update] Nenhum script valido disponivel', { requestId });
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

    // TELEMETRIA: Registrar decisao "allowed" (update sera enviado)
    await logRolloutDecision('allowed', release.version, rolloutPolicy?.rollout_percentage || 100);

    return new Response(
      JSON.stringify({
        version: release.version,
        script_content: finalScriptContent,
        sha256: legacySha256,
        script_sha256: calculatedSha256, // Alias for v5.0.13+ agents that expect this field
        script_content_base64: base64Script,
        sha256_base64: base64Sha256,
        signature_base64: release.signature_base64 || null,
        signed_at: release.signed_at || null,
        signed_by: release.signed_by || null,
        release_notes: release.release_notes,
        platform: platform,
        current_version: agent.agent_version,
        legacy_agent_detected: isLegacyAgent,
        self_healing_note: isLegacyAgent ? 'Script saved to disk. New version active after Windows reboot.' : null,
        // CONFIRMATION INSTRUCTIONS (critical for closing the loop)
        confirm_url: `${SUPABASE_URL}/functions/v1/confirm-force-update`,
        confirm_method: 'POST',
        confirm_body_schema: {
          new_version: release.version,
          old_version: agent.agent_version || 'unknown'
        },
        confirm_required_headers: ['X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce'],
        confirm_instructions: 'After applying the update, POST to confirm_url with confirm_body_schema and HMAC headers to register the new version.'
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
