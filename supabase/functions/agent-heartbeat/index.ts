/**
 * Agent Heartbeat Proxy - v4.0.7 Compatibility + Force Update + COST-OPT-V6 Job Delivery
 * 
 * COST-OPT-V6: Now includes pending jobs in heartbeat response to eliminate
 * separate poll-jobs calls. Agent processes jobs from heartbeat response.
 * 
 * This Edge Function acts as a proxy/alias for the main heartbeat endpoint.
 * VIKTOR RECOVERY: Now includes force_update logic to update v4.0.6-SAFE-ROLLBACK agents
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts"
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts'
import { signJob } from '../_shared/crypto-utils.ts'

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }
  
  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Log that this is a legacy request
    logger.info('[PROXY] agent-heartbeat called - forwarding to heartbeat endpoint')

    // Get agent token
    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Token do agente necessario' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Interface for OS info
    interface OSInfo {
      os_type?: string;
      platform?: string;
      os_version?: string;
      hostname?: string;
      agent_version?: string;
    }

    // Validate token format
    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token invalido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Fetch agent by token hash - VIKTOR: Include force_update fields and tenant_id
    const tokenHash = await hashToken(agentToken)
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, hmac_secret, status, tenant_id, force_update_version, force_update_reason, force_update_override_safe_mode, force_update_at, agent_version, skip_firewall_remediation, agent_state, archived_at)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    // Check if agent needs key rotation (key expiring in < 72 hours)
    let keyRotationNeeded = false
    let keyRotationDeadline: string | null = null
    
    if (token?.agents) {
      const agentId = (token.agents as any).id
      const { data: signingKey } = await supabase
        .from('agent_signing_keys')
        .select('id, expires_at, rotation_signaled_at')
        .eq('agent_id', agentId)
        .is('revoked_at', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (signingKey?.expires_at) {
        const expiresAt = new Date(signingKey.expires_at)
        const now = new Date()
        const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
        
        // Signal rotation if < 72 hours until expiry
        if (hoursUntilExpiry < 72 && hoursUntilExpiry > 0) {
          keyRotationNeeded = true
          keyRotationDeadline = signingKey.expires_at
          
          // Mark rotation as signaled (if not already)
          if (!signingKey.rotation_signaled_at) {
            await supabase
              .from('agent_signing_keys')
              .update({ rotation_signaled_at: new Date().toISOString() })
              .eq('id', signingKey.id)
            
            logger.info('[PROXY] Key rotation signaled', { 
              agentId, 
              expiresAt: signingKey.expires_at,
              hoursUntilExpiry: Math.round(hoursUntilExpiry)
            })
          }
        }
      }
    }

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ error: 'Token invalido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const agent = token.agents as unknown as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string; 
      status: string;
      tenant_id: string;
      force_update_version: string | null;
      force_update_reason: string | null;
      force_update_override_safe_mode: boolean | null;
      force_update_at: string | null;
      agent_version: string | null;
      agent_state: string | null;
      archived_at: string | null;
    }

    let archivedHeartbeatAction: 'reactivated' | 'alert_only' | null = null

    // HMAC verification
    if (!agent.hmac_secret) {
      logger.error('[PROXY] Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret, {
      agentId: agent.id,
      tenantId: agent.tenant_id,
      endpoint: 'agent-heartbeat',
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined
    })
    if (!hmacResult.valid) {
      logger.warn('[PROXY] HMAC verification failed', { 
        agentName: agent.agent_name, 
        errorCode: hmacResult.errorCode
      })
      return new Response(
        JSON.stringify({ 
          error: 'unauthorized',
          code: hmacResult.errorCode,
          message: hmacResult.errorMessage,
          transient: hmacResult.transient,
          // Fase 2: Include server time for clock skew recovery
          server_time_ms: hmacResult.serverTimeMs,
          skew_seconds: hmacResult.skewSeconds,
          received_timestamp: hmacResult.receivedTimestamp,
          max_skew_seconds: hmacResult.maxSkewSeconds
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
 
    // Parse body after HMAC verification
    let osInfo: OSInfo = {}
    if (hmacResult.rawBody) {
      try {
        const parsedBody = JSON.parse(hmacResult.rawBody)
        osInfo = parsedBody || {}
      } catch {
        // Empty or invalid body is OK for legacy heartbeats
      }
    }
 
    // Rate limiting: aligned with heartbeat/index.ts for post-update resilience
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'heartbeat', {
      maxRequests: 6,
      windowMinutes: 5,
      blockMinutes: 2,
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

    if (agent.archived_at) {
      logger.info('[PROXY] Heartbeat from archived agent, delegating to reactivation handler', {
        agentName: agent.agent_name,
        agentState: agent.agent_state,
        archivedAt: agent.archived_at,
      })

      const { data: reactivationResult, error: reactivationError } = await supabase
        .rpc('handle_archived_agent_heartbeat', {
          p_agent_id: agent.id,
          p_tenant_id: agent.tenant_id,
        })

      if (reactivationError) {
        logger.error('[PROXY] Archived agent reactivation handler failed', {
          error: reactivationError,
          agentName: agent.agent_name,
        })

        return new Response(
          JSON.stringify({ error: 'Failed to handle archived agent heartbeat' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      archivedHeartbeatAction = (reactivationResult as any)?.action === 'reactivated'
        ? 'reactivated'
        : 'alert_only'

      logger.info('[PROXY] Archived agent handler result', {
        agentName: agent.agent_name,
        result: reactivationResult,
      })

      if (archivedHeartbeatAction === 'alert_only') {
        return new Response(
          JSON.stringify({
            ok: true,
            agent: agent.agent_name,
            timestamp: new Date().toISOString(),
            proxy: true,
            archived: true,
            requires_manual_approval: true,
            message: 'Agent is archived. Manual approval required for reactivation.',
            heartbeat_interval_seconds: 3600,
            poll_interval_seconds: 3600,
            jobs: [],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
      }

      logger.info('[PROXY] Archived agent reactivated, continuing heartbeat processing', {
        agentName: agent.agent_name,
      })
    }
    
    logger.info('[PROXY] Heartbeat received via legacy endpoint', { 
      agentName: agent.agent_name,
      reactivated: archivedHeartbeatAction === 'reactivated',
    })

    // Build update data
    interface AgentUpdate {
      last_heartbeat: string;
      status: string;
      os_type?: string;
      os_version?: string;
      hostname?: string;
      agent_version?: string;
      ed25519_supported?: boolean;
      signature_mode?: string;
    }

    const updateData: AgentUpdate = { 
      last_heartbeat: new Date().toISOString(),
      status: 'active'
    }
    
    // Normalize os_type from body or use agent's current value
    const rawOsType = osInfo.os_type || osInfo.platform || ''
    if (rawOsType) {
      updateData.os_type = rawOsType.toLowerCase()
    }
    if (osInfo.os_version) {
      updateData.os_version = osInfo.os_version
    }
    if (osInfo.hostname) {
      updateData.hostname = osInfo.hostname
    }
    if (osInfo.agent_version) {
      const incomingVersion = osInfo.agent_version.trim().toLowerCase()
      const currentVersion = (agent.agent_version || '').trim().toLowerCase()
      if (incomingVersion !== currentVersion) {
        updateData.agent_version = osInfo.agent_version
      }
    }
    
    // Capturar Ed25519 capability flags do payload
    const ed25519Supported = (osInfo as any).ed25519_supported as boolean | undefined;
    const signatureMode = (osInfo as any).signature_mode as string | undefined;
    if (ed25519Supported !== undefined) {
      updateData.ed25519_supported = ed25519Supported;
    }
    if (signatureMode) {
      updateData.signature_mode = signatureMode;
    }

    // Update agent
    const { error: updateError } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id)

    if (updateError) {
      logger.error('[PROXY] Failed to update agent heartbeat', {
        error: updateError,
        agentId: agent.id,
        agentName: agent.agent_name
      })
    } else {
      logger.success('[PROXY] Agent heartbeat updated successfully', { agentName: agent.agent_name })
    }

    // V-7007: Merge token update + override check into the existing agent update
    // instead of 3 sequential queries (update agent → update token → select override)
    // Token last_used_at update runs in parallel
    const [, overrideCheck] = await Promise.all([
      supabase
        .from('agent_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('token_hash', tokenHash),
      supabase
        .from('agents')
        .select('force_update_override_safe_mode_expires_at')
        .eq('id', agent.id)
        .single()
    ]);
    
    const overrideValid = agent.force_update_override_safe_mode && 
      (!overrideCheck?.data?.force_update_override_safe_mode_expires_at || 
       new Date(overrideCheck.data.force_update_override_safe_mode_expires_at) > new Date())

    // FIXED: Use force_update_at as trigger instead of version comparison
    // This allows same-version pushes (e.g., v5.0.13 hotfix re-download)
    if (agent.force_update_version && agent.force_update_at) {
      logger.info('[PROXY] Force update pending', { 
        agentName: agent.agent_name,
        currentVersion: agent.agent_version,
        targetVersion: agent.force_update_version
      })

      // Determine platform (default to windows for legacy agents)
      const platform = (updateData.os_type || 'windows').toLowerCase()

      // Fetch the release script
      const { data: release, error: releaseError } = await supabase
        .from('agent_releases')
        .select('id, version, script_content, sha256, signature_base64, signed_at')
        .eq('version', agent.force_update_version)
        .eq('platform', platform)
        .eq('is_active', true)
        .maybeSingle()

      if (releaseError) {
        logger.error('[PROXY] Failed to fetch release', { 
          error: releaseError,
          version: agent.force_update_version,
          platform 
        })
      }

      if (release?.script_content) {
        // PHASE 1 FIX: Apply runtime hotfixes before delivery
        let scriptToDeliver = release.script_content;
        if (platform === 'windows') {
          try {
            const hotfixResult = applyWindowsScriptHotfix(scriptToDeliver);
            if (hotfixResult.changed) {
              scriptToDeliver = hotfixResult.content;
              logger.info('[PROXY] Applied runtime hotfixes to force_update script', {
                agentName: agent.agent_name,
                hotfixes: hotfixResult.reasons,
              });
              // Best-effort: persist hotfixed content back to agent_releases
              const hfBytes = new TextEncoder().encode(scriptToDeliver);
              const hfHashBuf = await crypto.subtle.digest('SHA-256', hfBytes);
              const hfHash = Array.from(new Uint8Array(hfHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
              await supabase.from('agent_releases')
                .update({ script_content: scriptToDeliver, sha256: hfHash })
                .eq('id', release.id);
            }
          } catch (hfErr) {
            logger.warn('[PROXY] Hotfix injection failed (non-fatal)', { error: (hfErr as Error).message });
          }
        }

        logger.info('[PROXY] Sending force_update in response', { 
          agentName: agent.agent_name,
          targetVersion: release.version,
          platform,
          hasSignature: !!release.signature_base64,
          skipFirewallRemediation: agent.skip_firewall_remediation === true
        })

        // Normalize line endings (CRLF for Windows)
        let normalizedScript = scriptToDeliver
        if (platform === 'windows') {
          normalizedScript = normalizedScript.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
        }

        // Encode to Base64
        const encoder = new TextEncoder()
        const scriptBytes = encoder.encode(normalizedScript)
        const base64Script = encodeBase64(scriptBytes)

        // Calculate SHA256 of normalized script
        const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        // Return response WITH force_update data
        return new Response(
          JSON.stringify({ 
            ok: true,
            agent: agent.agent_name,
            timestamp: new Date().toISOString(),
            proxy: true,
            // VIKTOR RECOVERY: Force update data
            force_update: true,
            target_version: release.version,
            script_content_base64: base64Script,
            sha256: calculatedSha256,
            script_sha256: calculatedSha256, // Alias for v5.0.13+ agents
            ecdsa_signature: release.signature_base64 || null, // Pass real signature if available; null triggers fail-open on legacy agents
            script_hash_signature: release.signature_base64 || null,
            signature_base64: release.signature_base64 || null,
            script_hash_signed_at: release.signed_at || null,
            skip_firewall_remediation: agent.skip_firewall_remediation || false,
            reason: agent.force_update_reason || 'System recovery update',
            override_safe_mode: overrideValid
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        )
      } else {
        logger.warn('[PROXY] No active release found for force_update', { 
          version: agent.force_update_version,
          platform
        })
      }
    }

    // ============================================
    // COST-OPT-V6: Claim pending jobs in heartbeat response
    // Eliminates separate poll-jobs call (~144 invocations/day saved per agent)
    // ============================================
    let jobsResponse: Record<string, unknown>[] = [];
    try {
      const { data: claimedJobs, error: claimError } = await supabase
        .rpc('claim_jobs_for_agent', {
          p_agent_id: agent.id,
          p_limit: 3
        });

      if (!claimError && claimedJobs && claimedJobs.length > 0) {
        const privateKey = Deno.env.get('ED25519_PRIVATE_KEY');
        
        jobsResponse = await Promise.all(
          claimedJobs.filter((j: any) => j && j.job_id && j.job_type && j.execution_id).map(async (j: any) => {
            let signatureInfo: Record<string, string> = {};
            if (privateKey) {
              try {
                const signed = await signJob(j.job_id, j.job_type, j.payload || {}, privateKey);
                signatureInfo = { payload_signature: signed.signature, signing_alg: signed.algorithm };
              } catch (signErr) {
                logger.warn('[PROXY] Failed to sign job in heartbeat', { jobId: j.job_id, error: (signErr as Error).message });
                return null;
              }
            }
            return {
              id: j.job_id,
              type: j.job_type,
              job_type: j.job_type,
              payload: j.payload || {},
              approved: true,
              agent_id: agent.id,
              expires_at: j.expires_at,
              execution_id: j.execution_id,
              nonce: j.nonce,
              payload_hash: j.payload_hash,
              execution_index: j.execution_index,
              previous_execution_hash: j.previous_execution_hash,
              ...signatureInfo,
            };
          })
        ).then(results => results.filter(Boolean) as Record<string, unknown>[]);

        if (jobsResponse.length > 0) {
          logger.info('[PROXY] Jobs piggybacked on heartbeat response', {
            agentName: agent.agent_name,
            jobCount: jobsResponse.length,
            jobIds: jobsResponse.map(j => j.id),
          });
        }
      }
    } catch (jobErr) {
      logger.warn('[PROXY] Failed to claim jobs in heartbeat (non-fatal)', { error: (jobErr as Error).message });
    }

    // Standard response (no force_update) - include key rotation signal + jobs if available
    const response: Record<string, unknown> = { 
      ok: true,
      agent: agent.agent_name,
      timestamp: new Date().toISOString(),
      proxy: true,
      script_sha256: null,
      skip_firewall_remediation: (agent as any).skip_firewall_remediation || false,
      aggregation: null,
      // COST-OPT-V6: Heartbeat = 600s, poll = 600s (same interval, jobs come via heartbeat)
      heartbeat_interval_seconds: 600,
      poll_interval_seconds: 600,
      // COST-OPT-V6: Include jobs in heartbeat response
      jobs: jobsResponse,
    };
    
    // Add key rotation signal if needed
    if (keyRotationNeeded) {
      response.rotate_key = true;
      response.rotation_deadline = keyRotationDeadline;
      logger.info('[PROXY] Key rotation signaled in response', { 
        agentName: agent.agent_name, 
        deadline: keyRotationDeadline 
      });
    }
    
    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'agent-heartbeat-proxy')
  }
})
