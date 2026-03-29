import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { signPayload } from '../_shared/crypto-utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ED25519_PRIVATE_KEY = Deno.env.get('ED25519_PRIVATE_KEY');

function normalizeVersion(version: string | null | undefined): string {
  return (version ?? '').trim().toLowerCase().replace(/^v/, '');
}

function extractEmbeddedVersion(scriptContent: string): string | null {
  const patterns = [
    /CyberShield\s+Agent\s*-\s*(?:Windows|Linux|macOS)\s+v?(\d+\.\d+\.\d+)/i,
    /AGENT_VERSION\s*=\s*["']v?(\d+\.\d+\.\d+)["']/i,
    /\$AgentVersion\s*=\s*["']v?(\d+\.\d+\.\d+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = scriptContent.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * FASE 3 + SSA-004: Edge Function para registrar novas releases de agentes
 * 
 * Permite que o deploy automatizado registre novas versoes nas tabelas
 * agent_releases e agent_versions sem necessidade de SQL manual.
 * 
 * SSA-004: Auto-assina releases com Ed25519 se chave privada disponivel
 */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();

  try {
    logger.info('[register-agent-release] Request received', { requestId });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verificar autenticacao (super admin ou deploy automation)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se e super admin (suporta usuarios com multiplos roles)
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Requires super_admin role' }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payload = await req.json();
    const { 
      platform, 
      version, 
      script_content, 
      release_notes, 
      channel = 'stable', 
      manual_sha256,
      // FASE 2: Assinatura criptografica Ed25519
      signature_base64,
      signed_by
    } = payload;

    if (!platform || !version || !script_content) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: platform, version, script_content' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // SUPPLY CHAIN VALIDATION (P0 CRITICAL)
    // Prevents placeholder/corrupted scripts from being registered
    // ========================================
    const MIN_SCRIPT_SIZE = 10000; // 10KB minimum for valid agent scripts
    if (script_content.length < MIN_SCRIPT_SIZE) {
      logger.error('[register-agent-release] SUPPLY_CHAIN_VIOLATION: Script too small', {
        requestId,
        platform,
        version,
        size: script_content.length,
        minRequired: MIN_SCRIPT_SIZE
      });
      return new Response(
        JSON.stringify({
          error: 'SUPPLY_CHAIN_VIOLATION',
          message: `Script content too small (${script_content.length} bytes). Minimum required: ${MIN_SCRIPT_SIZE} bytes. Possible placeholder or corruption detected.`,
          size: script_content.length,
          minRequired: MIN_SCRIPT_SIZE
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[register-agent-release] Supply chain validation passed', {
      requestId,
      platform,
      version,
      scriptSize: script_content.length
    });

    // CRITICAL: Platform validation to prevent wrong script type registration
    const scriptTrimmed = script_content.trim();
    const isWindowsScript = scriptTrimmed.startsWith('<#') || scriptTrimmed.startsWith('param(');
    const isUnixScript = scriptTrimmed.startsWith('#!/');

    if (platform === 'windows' && !isWindowsScript) {
      logger.error('[register-agent-release] Platform mismatch: Windows requires PowerShell script', {
        requestId,
        platform,
        version,
        scriptStart: scriptTrimmed.substring(0, 50)
      });
      return new Response(
        JSON.stringify({ 
          error: 'Platform mismatch: Windows scripts must start with <# or param()',
          detected: isUnixScript ? 'Unix/macOS bash script' : 'Unknown script type'
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    if ((platform === 'linux' || platform === 'macos') && !isUnixScript) {
      logger.error('[register-agent-release] Platform mismatch: Linux/macOS requires bash script', {
        requestId,
        platform,
        version,
        scriptStart: scriptTrimmed.substring(0, 50)
      });
      return new Response(
        JSON.stringify({ 
          error: 'Platform mismatch: Linux/macOS scripts must start with #!/',
          detected: isWindowsScript ? 'Windows PowerShell script' : 'Unknown script type'
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[register-agent-release] Platform validation passed', {
      requestId,
      platform,
      isWindowsScript,
      isUnixScript
    });

    const embeddedVersion = extractEmbeddedVersion(script_content);
    if (!embeddedVersion) {
      logger.error('[register-agent-release] Could not extract embedded version from script', {
        requestId,
        platform,
        version,
      });
      return new Response(
        JSON.stringify({
          error: 'Embedded version not found in script content',
          message: 'The uploaded script must declare its own version in the header or AGENT_VERSION variable.'
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    if (normalizeVersion(embeddedVersion) !== normalizeVersion(version)) {
      logger.error('[register-agent-release] Embedded script version mismatch', {
        requestId,
        platform,
        declaredVersion: version,
        embeddedVersion,
      });
      return new Response(
        JSON.stringify({
          error: 'Embedded script version mismatch',
          message: `Declared version ${version} does not match embedded script version ${embeddedVersion}`,
          declared_version: version,
          embedded_version: embeddedVersion,
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Use manual SHA256 if provided (for BOM compatibility with old agents)
    // Otherwise calculate SHA256 normally
    let sha256: string;
    if (manual_sha256) {
      sha256 = manual_sha256;
      logger.info('[register-agent-release] Using manual SHA256', {
        requestId,
        manual_sha256: sha256.substring(0, 16) + '...'
      });
    } else {
      const encoder = new TextEncoder();
      const data = encoder.encode(script_content);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    logger.info('[register-agent-release] Registering new release', {
      requestId,
      platform,
      version,
      sha256: sha256.substring(0, 16) + '...',
      size: script_content.length,
      hasSignature: !!signature_base64,
      signedBy: signed_by || null
    });

    // Desativar versoes anteriores como "latest"
    await supabase
      .from('agent_versions')
      .update({ is_latest: false })
      .eq('platform', platform);

    await supabase
      .from('agent_releases')
      .update({ is_active: false })
      .eq('platform', platform)
      .eq('channel', channel);

    // Inserir em agent_releases
    const releaseData: Record<string, unknown> = {
      platform,
      version,
      channel,
      script_content,
      sha256,
      release_notes: release_notes || `Release ${version}`,
      is_active: true,
      created_by: user.id
    };

    // SSA-004: Auto-assinar com Ed25519 se chave privada disponivel
    let finalSignature = signature_base64;
    let finalSignedBy = signed_by || 'manual';

    if (!finalSignature && ED25519_PRIVATE_KEY) {
      try {
        // Assinar o script content diretamente (canonical format for releases)
        const canonicalPayload = `release:${platform}:${version}:${sha256}`;
        finalSignature = await signPayload(canonicalPayload, ED25519_PRIVATE_KEY);
        finalSignedBy = 'automation';
        logger.info('[register-agent-release] Auto-signed release with Ed25519', {
          requestId,
          platform,
          version,
          canonicalPayload: canonicalPayload.substring(0, 50) + '...'
        });
      } catch (signError) {
        logger.error('[register-agent-release] Failed to auto-sign release', {
          requestId,
          error: (signError as Error).message
        });
        // Continue without signature - not critical for release registration
      }
    }

    if (finalSignature) {
      releaseData.signature_base64 = finalSignature;
      releaseData.signed_at = new Date().toISOString();
      releaseData.signed_by = finalSignedBy;
      logger.info('[register-agent-release] Adding Ed25519 signature to release', {
        requestId,
        signedBy: releaseData.signed_by
      });
    } else if (!ED25519_PRIVATE_KEY) {
      logger.warn('[register-agent-release] ED25519_PRIVATE_KEY not configured - release will be unsigned', {
        requestId
      });
    }

    const { error: releaseError } = await supabase
      .from('agent_releases')
      .upsert(releaseData, {
        onConflict: 'platform,version,channel'
      });

    if (releaseError) {
      logger.error('[register-agent-release] Failed to insert agent_releases', {
        requestId,
        error: releaseError
      });
      throw releaseError;
    }

    // Inserir em agent_versions
    const { error: versionError } = await supabase
      .from('agent_versions')
      .upsert({
        platform,
        version,
        is_latest: true,
        sha256,
        size_bytes: script_content.length,
        download_url: `${SUPABASE_URL}/functions/v1/serve-agent-update`,
        release_notes: release_notes || `Release ${version}`
      }, {
        onConflict: 'platform,version'
      });

    if (versionError) {
      logger.error('[register-agent-release] Failed to insert agent_versions', {
        requestId,
        error: versionError
      });
      throw versionError;
    }

    logger.info('[register-agent-release] Release registered successfully', {
      requestId,
      platform,
      version
    });

    return new Response(
      JSON.stringify({
        success: true,
        platform,
        version,
        sha256,
        size_bytes: script_content.length,
        signature_present: !!finalSignature,
        signed_by: finalSignedBy || null
      }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const err = error as Error;
    logger.error('[register-agent-release] Internal error', {
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
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
