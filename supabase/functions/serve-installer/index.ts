import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { 
  WINDOWS_INSTALLER_TEMPLATE,
  LINUX_INSTALLER_TEMPLATE_V3,
  MACOS_INSTALLER_TEMPLATE_V3
} from '../_shared/installer-template.ts';
import { 
  LINUX_INSTALLER_TEMPLATE_V3_ENVVARS,
  MACOS_INSTALLER_TEMPLATE_V3_ENVVARS
} from '../_shared/installer-template-envvars.ts';
import { AGENT_SCRIPT_MACOS_SH } from '../_shared/agent-script-macos-content.ts';
import { AGENT_SCRIPT_LINUX_SH } from '../_shared/agent-script-linux-content.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

/**
 * ✅ PHASE 1 & 2 COMPLETE: Centralized Templates
 * 
 * All installer templates are now imported from the single source of truth:
 * - supabase/functions/_shared/installer-template.ts (args mode)
 * - supabase/functions/_shared/installer-template-envvars.ts (envvars mode)
 * 
 * This ensures:
 * ✅ No duplicate templates
 * ✅ All security features (cleanup, self-test, telemetry)
 * ✅ Consistent behavior across serve-installer and build-agent-exe
 * ✅ Single point of maintenance
 */

// Deno server to handle POST requests
Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  console.log('[serve-installer] Function started', { 
    timestamp: new Date().toISOString(), 
    requestId,
    method: req.method 
  });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  if (req.method === 'GET' && new URL(req.url).pathname === '/serve-installer') {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const healthy = !!(supabaseUrl && supabaseServiceKey);
    
    return new Response(
      JSON.stringify({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'serve-installer',
        checks: {
          env_vars: healthy,
          supabase_url: !!supabaseUrl,
          service_role_key: !!supabaseServiceKey
        }
      }),
      {
        status: healthy ? 200 : 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  // Validate environment variables
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[serve-installer] CRITICAL: Missing environment variables', {
      requestId,
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseServiceKey
    });
    return new Response(
      JSON.stringify({
        error: 'Server configuration error',
        details: 'Missing required environment variables',
        timestamp: new Date().toISOString(),
        requestId
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    return await withTimeout(async () => {
      console.log(`[${requestId}] Processing request - ${req.method} ${req.url}`);

      const url = new URL(req.url);
      const enrollmentKey = url.pathname.split('/').pop();
      
      // Get mode: 'args' (default) or 'envvars'
      const mode = url.searchParams.get('mode') || 'args';
      if (mode !== 'args' && mode !== 'envvars') {
        console.log(`[${requestId}] Invalid mode parameter: ${mode}`);
        return new Response(
          JSON.stringify({ 
            error: 'Invalid mode parameter. Use ?mode=args or ?mode=envvars' 
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      console.log(`[${requestId}] Mode: ${mode}`);

      if (!enrollmentKey) {
      console.log(`[${requestId}] Missing enrollment key`);
      return new Response('Enrollment key is required', { 
        status: 400,
        headers: corsHeaders
      });
    }

    const supabaseClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch enrollment key
    const { data: enrollmentData, error: enrollmentError } = await supabaseClient
      .from('enrollment_keys')
      .select('agent_id, is_active, expires_at, tenant_id')
      .eq('key', enrollmentKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (enrollmentError || !enrollmentData) {
      console.log(`[${requestId}] Invalid enrollment key: ${enrollmentError?.message}`);
      return new Response('Invalid or expired enrollment key', { 
        status: 404,
        headers: corsHeaders
      });
    }

    if (!enrollmentData.is_active) {
      console.log(`[${requestId}] Enrollment key already used`);
      return new Response('This enrollment key has been used', { 
        status: 410,
        headers: corsHeaders
      });
    }

    if (new Date(enrollmentData.expires_at) < new Date()) {
      console.log(`[${requestId}] Enrollment key expired`);
      return new Response('This enrollment key has expired', { 
        status: 410,
        headers: corsHeaders
      });
    }

    // FASE 1 CORREÇÃO CRÍTICA: Fetch token from agent_tokens
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('agent_tokens')
      .select('token')
      .eq('agent_id', enrollmentData.agent_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.log(`[${requestId}] Agent token not found: ${tokenError?.message}`);
      return new Response('Agent token not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // FASE 1 CORREÇÃO CRÍTICA: Fetch agent info AND hmac_secret from agents table
    const { data: agentData, error: agentError } = await supabaseClient
      .from('agents')
      .select('agent_name, os_type, hmac_secret')
      .eq('id', enrollmentData.agent_id)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (agentError || !agentData) {
      console.log(`[${requestId}] Agent not found: ${agentError?.message}`);
      return new Response('Agent not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // FASE 1 CRÍTICO: Use inline agent script (always available)
    console.log(`[${requestId}] Using inline agent script`);
    
    const { getAgentScriptWindows, validateAgentScript, calculateScriptHash } = await import('../_shared/agent-script-windows-content.ts');
    const agentScriptContent = getAgentScriptWindows();
    
    if (!validateAgentScript(agentScriptContent)) {
      console.error(`[${requestId}] CRITICAL: Inline script validation failed`);
      return new Response(
        'Failed to generate secure installer - inline script validation failed',
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        }
      );
    }
    
    const agentScriptHash = await calculateScriptHash(agentScriptContent);
    
    // Validate agent script content is valid
    if (!agentScriptContent || agentScriptContent.length < 5000) {
      console.error(`[${requestId}] Agent script validation failed: invalid content length (${agentScriptContent?.length || 0} bytes)`);
      return new Response('Agent script validation failed: content too short or missing', { 
        status: 503,
        headers: corsHeaders
      });
    }
    
    console.log(`[${requestId}] Agent script validated successfully`, { 
      size: agentScriptContent.length,
      sizeKB: (agentScriptContent.length / 1024).toFixed(2),
      hash: agentScriptHash
    });


    // FASE 3: Enhanced credential validation
    const agentToken = tokenData.token;
    const hmacSecret = agentData.hmac_secret;
    
    // Validate token is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!agentToken || !uuidRegex.test(agentToken)) {
      console.error(`[${requestId}] Invalid agent token format: ${agentToken?.substring(0, 8)}...`);
      return new Response('Invalid agent token format', { 
        status: 500,
        headers: corsHeaders
      });
    }
    
    // Validate HMAC secret is 64 characters hex (SHA256)
    if (!hmacSecret || hmacSecret.length !== 64 || !/^[0-9a-f]{64}$/i.test(hmacSecret)) {
      console.error(`[${requestId}] Invalid HMAC secret format: length=${hmacSecret?.length}, valid_hex=${/^[0-9a-f]+$/i.test(hmacSecret || '')}`);
      return new Response('Invalid HMAC secret format', { 
        status: 500,
        headers: corsHeaders
      });
    }
    
    console.log(`[${requestId}] Credentials validated:`, {
      token_prefix: agentToken.substring(0, 8),
      hmac_prefix: hmacSecret.substring(0, 8),
      token_format: 'UUID',
      hmac_format: 'SHA256-HEX'
    });

    // Determine platform
    const platform = agentData.os_type || 'windows';
    console.log(`[${requestId}] Generating ${platform} installer for ${agentData.agent_name}`);

    // Select template and agent script content based on platform and mode
    let templateContent: string;
    let agentScriptContentForPlatform: string;
    let agentScriptUrl: string = '';
    
    if (platform === 'windows') {
      // Windows always uses args mode (PowerShell parameters)
      templateContent = WINDOWS_INSTALLER_TEMPLATE;
      agentScriptContentForPlatform = agentScriptContent;
      agentScriptUrl = ''; // Windows embeds script in installer
    } else if (platform === 'macos') {
      // macOS can use args or envvars mode
      templateContent = mode === 'envvars' 
        ? MACOS_INSTALLER_TEMPLATE_V3_ENVVARS 
        : MACOS_INSTALLER_TEMPLATE_V3;
      agentScriptContentForPlatform = AGENT_SCRIPT_MACOS_SH;
      agentScriptUrl = `${SUPABASE_URL}/storage/v1/object/public/agents/cybershield-agent-macos-v3.sh`;
      console.log('[' + requestId + '] Using macOS agent script v3 (mode: ' + mode + ', ' + agentScriptContentForPlatform.length + ' bytes)');
    } else { // linux
      // Linux can use args or envvars mode
      templateContent = mode === 'envvars'
        ? LINUX_INSTALLER_TEMPLATE_V3_ENVVARS
        : LINUX_INSTALLER_TEMPLATE_V3;
      agentScriptContentForPlatform = AGENT_SCRIPT_LINUX_SH;
      agentScriptUrl = `${SUPABASE_URL}/storage/v1/object/public/agents/cybershield-agent-linux-v3.sh`;
      console.log('[' + requestId + '] Using Linux agent script v3 (mode: ' + mode + ', ' + agentScriptContentForPlatform.length + ' bytes)');
    }

    // FASE 2: Replace placeholders with validated credentials
    // Using function callbacks to prevent $ character interpretation
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, () => agentToken)
      .replace(/\{\{HMAC_SECRET\}\}/g, () => hmacSecret)
      .replace(/\{\{SERVER_URL\}\}/g, () => SUPABASE_URL)
      .replace(/\{\{POLL_INTERVAL\}\}/g, '60')
      .replace(/\{\{AGENT_HASH\}\}/g, () => agentScriptHash)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, () => agentScriptContentForPlatform)
      .replace(/\{\{AGENT_NAME\}\}/g, () => agentData.agent_name)
      .replace(/\{\{AGENT_VERSION\}\}/g, '3.0.0')
      .replace(/\{\{AGENT_SCRIPT_URL\}\}/g, () => agentScriptUrl)
      .replace(/\{\{TIMESTAMP\}\}/g, () => new Date().toISOString());

    // Final validation: ensure no placeholders remain
    if (templateContent.includes('{{')) {
      const remainingPlaceholders = templateContent.match(/\{\{[A-Z_]+\}\}/g) || [];
      console.error(`[${requestId}] INCOMPLETE TEMPLATE - Found ${remainingPlaceholders.length} unresolved placeholders:`, remainingPlaceholders);
      
      // Log context around first few placeholders for debugging
      remainingPlaceholders.slice(0, 3).forEach((placeholder, idx) => {
        const pos = templateContent.indexOf(placeholder);
        const context = templateContent.substring(Math.max(0, pos - 100), pos + 150);
        console.error(`[${requestId}] Placeholder ${idx + 1} context:`, context.replace(/\n/g, '\\n'));
      });
      
      return new Response(
        `Installer generation failed: ${remainingPlaceholders.length} incomplete placeholders: ${remainingPlaceholders.slice(0, 5).join(', ')}`, 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
        }
      );
    }

    // ✅ PHASE 3: Security validation - detect dangerous patterns
    console.log(`[${requestId}] Validating script security...`);
    
    const dangerousPatterns = [
      { pattern: /\$headers\[['"]/, description: 'Unsafe $headers indexing (can cause null reference errors)' },
      { pattern: /Write-Log.*\$headers\[/, description: 'Unsafe $headers logging (can cause script failure)' }
    ];
    
    for (const { pattern, description } of dangerousPatterns) {
      if (pattern.test(templateContent)) {
        console.error(`[${requestId}] SECURITY VIOLATION: Dangerous pattern detected - ${description}`);
        return new Response(
          JSON.stringify({
            error: 'Template validation failed',
            details: `Security violation: ${description}`,
            timestamp: new Date().toISOString(),
            requestId
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }
    }
    
    console.log(`[${requestId}] ✓ Script security validation passed`);

    // FASE 2: Calculate SHA256 hash of complete installer script
    const installerEncoder = new TextEncoder();
    const installerData = installerEncoder.encode(templateContent);
    const installerHashBuffer = await crypto.subtle.digest('SHA-256', installerData);
    const installerHashArray = Array.from(new Uint8Array(installerHashBuffer));
    const installerSha256 = installerHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const installerSizeBytes = installerData.length;

    console.log(`[${requestId}] Installer SHA256: ${installerSha256}, Size: ${installerSizeBytes} bytes`);

    // FASE 2: Persist installer hash to database
    try {
      const { error: updateError } = await supabaseClient
        .from('enrollment_keys')
        .update({
          installer_sha256: installerSha256,
          installer_size_bytes: installerSizeBytes,
          installer_generated_at: new Date().toISOString()
        })
        .eq('key', enrollmentKey);

      if (updateError) {
        console.error(`[${requestId}] Failed to persist installer hash:`, updateError);
      } else {
        console.log(`[${requestId}] Installer hash persisted to database`);
      }
    } catch (dbError) {
      console.error(`[${requestId}] Database error persisting hash:`, dbError);
    }

    // Return script
    const fileName = platform === 'windows'
      ? `install-${agentData.agent_name}-windows.ps1`
      : `install-${agentData.agent_name}-linux.sh`;

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Completed successfully in ${duration}ms`);

      // FASE 2: Return script with SHA256 in header
      return new Response(templateContent, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'X-Script-SHA256': installerSha256,
          'X-Script-Size': installerSizeBytes.toString(),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        },
      });
    }, { timeoutMs: 30000 }); // 30s timeout for debug and complex operations

  } catch (error) {
    if (error instanceof Error && error.message === 'Request timeout') {
      return createTimeoutResponse(corsHeaders);
    }
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Failed after ${duration}ms:`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});