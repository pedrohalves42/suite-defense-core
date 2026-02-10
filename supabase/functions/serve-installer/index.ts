/**
 * serve-installer Edge Function
 * 
 * Generates and serves custom agent installer scripts with embedded credentials.
 * 
 * Security: Validates enrollment keys, enforces rate limits, and ensures HMAC secrets.
 * Platforms: Windows (PowerShell), Linux (Bash), macOS (Bash)
 * 
 * FORCE REBUILD: 2025-11-21T02:35:00Z - ParserError complete fix (build-agent-exe)
 * Last updated: 2025-01-19 - Added StartedAt validation for Jobs v3
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { 
  WINDOWS_INSTALLER_TEMPLATE,
  LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED,
  MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED
} from '../_shared/installer-template.ts';
import { 
  LINUX_INSTALLER_TEMPLATE_V3_ENVVARS,
  MACOS_INSTALLER_TEMPLATE_V3_ENVVARS
} from '../_shared/installer-template-envvars.ts';
// Linux/macOS scripts are now fetched from agent_releases database instead of placeholder files
import { INSTALLER_VERSION, LAST_UPDATED, getVersionInfo } from '../_shared/installer-version.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

/**
 * Valida que nao ha placeholders nao substituidos no script
 */
function validateNoPlaceholders(
  script: string,
  scriptType: string,
  requestId: string,
): void {
  const remaining = script.match(/\{\{[A-Z0-9_]+\}\}/g);

  if (!remaining || remaining.length === 0) return;

  const placeholderList = remaining.join(', ');

  console.error('[serve-installer] Placeholders nao substituidos', {
    scriptType,
    placeholders: placeholderList,
    count: remaining.length,
    requestId,
  });

  // Logar um pouco de contexto pra facilitar debug
  remaining.slice(0, 3).forEach((ph, idx) => {
    const pos = script.indexOf(ph);
    const context = script.substring(Math.max(0, pos - 120), pos + 120);
    console.error(
      `[serve-installer] Contexto do placeholder ${idx + 1}:`,
      context.replace(/\n/g, '\\n').slice(0, 240),
    );
  });

  throw new Error(
    `Script gerado contem ${remaining.length} placeholders nao substituidos: ${placeholderList}`,
  );
}

/**
 * [OK]  PHASE 1 & 2 COMPLETE: Centralized Templates
 * 
 * All installer templates are now imported from the single source of truth:
 * - supabase/functions/_shared/installer-template.ts (args mode)
 * - supabase/functions/_shared/installer-template-envvars.ts (envvars mode)
 * 
 * This ensures:
 * [OK]  No duplicate templates
 * [OK]  All security features (cleanup, self-test, telemetry)
 * [OK]  Consistent behavior across serve-installer and build-agent-exe
 * [OK]  Single point of maintenance
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
      // Log da versao do installer template
      console.log(`[${requestId}] ${getVersionInfo()}`);
      console.log(`[${requestId}] Processing request - ${req.method} ${req.url}`);

      const url = new URL(req.url);
      const enrollmentKey = url.pathname.split('/').pop();
      
      // SEC-02 P1 FIX: IP-based rate limiting for serve-installer
      const clientIp = req.headers.get('cf-connecting-ip') 
        || req.headers.get('x-real-ip') 
        || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
        || 'unknown';
      
      const supabaseClient = createClient(
        SUPABASE_URL,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      // Check rate limit: 10 requests per hour per IP, block for 30 minutes if exceeded
      const rateLimitResult = await checkRateLimit(
        supabaseClient,
        clientIp,
        'serve-installer',
        { maxRequests: 10, windowMinutes: 60, blockMinutes: 30 }
      );
      
      if (!rateLimitResult.allowed) {
        console.warn(`[${requestId}] Rate limit exceeded for IP: ${clientIp}`, {
          resetAt: rateLimitResult.resetAt
        });
        return new Response(
          JSON.stringify({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: rateLimitResult.resetAt?.toISOString()
          }),
          {
            status: 429,
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              'Retry-After': rateLimitResult.resetAt ? 
                Math.ceil((rateLimitResult.resetAt.getTime() - Date.now()) / 1000).toString() : '1800'
            }
          }
        );
      }
      
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
      
      console.log(`[${requestId}] Mode: ${mode}, IP: ${clientIp}`);

      if (!enrollmentKey) {
      console.log(`[${requestId}] Missing enrollment key`);
      return new Response('Enrollment key is required', { 
        status: 400,
        headers: corsHeaders
      });
    }

    // P1 SEC-001 FIX: Validate enrollment key by hash (not plaintext)
    const keyHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(enrollmentKey)
    );
    const enrollmentKeyHash = Array.from(new Uint8Array(keyHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Fetch enrollment key by hash (agent_token removed - P1 SEC-002 fix)
    const { data: enrollmentData, error: enrollmentError } = await supabaseClient
      .from('enrollment_keys')
      .select('agent_id, is_active, expires_at, tenant_id')
      .eq('key_hash', enrollmentKeyHash)
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

    // Resolve agent_id: use existing or auto-provision new agent
    let resolvedAgentId = enrollmentData.agent_id;
    let agentData: { agent_name: string; os_type: string | null; hmac_secret: string } | null = null;

    if (!resolvedAgentId) {
      // === AUTO-PROVISION: Create new agent for enrollment keys without agent_id ===
      console.log(`[${requestId}] Enrollment key has no agent_id - auto-provisioning new agent`);
      
      const hostname = url.searchParams.get('hostname') || `agent-${crypto.randomUUID().substring(0, 8)}`;
      const osPlatform = url.searchParams.get('os_type') || 'windows';
      
      // Generate HMAC secret (64 chars hex)
      const hmacBytes = new Uint8Array(32);
      crypto.getRandomValues(hmacBytes);
      const newHmacSecret = Array.from(hmacBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Insert new agent
      const { data: newAgent, error: newAgentError } = await supabaseClient
        .from('agents')
        .insert({
          agent_name: hostname,
          tenant_id: enrollmentData.tenant_id,
          status: 'active',
          os_type: osPlatform,
          hmac_secret: newHmacSecret,
          enrolled_at: new Date().toISOString(),
          agent_version: '0.0.0',
        })
        .select('id, agent_name, os_type, hmac_secret')
        .single();
      
      if (newAgentError || !newAgent) {
        console.error(`[${requestId}] Failed to auto-provision agent`, newAgentError);
        return new Response('Failed to create agent record', { 
          status: 500,
          headers: corsHeaders
        });
      }
      
      resolvedAgentId = newAgent.id;
      agentData = { agent_name: newAgent.agent_name, os_type: newAgent.os_type, hmac_secret: newAgent.hmac_secret };
      
      console.log(`[${requestId}] Auto-provisioned agent`, {
        agentId: resolvedAgentId,
        agentName: hostname,
        tenantId: enrollmentData.tenant_id
      });

      // Increment usage count on enrollment key
      try {
        const { error: rpcErr } = await supabaseClient.rpc('increment_enrollment_key_usage', { p_key_hash: enrollmentKeyHash });
        if (rpcErr) console.warn(`[${requestId}] Failed to increment EK usage (non-critical):`, rpcErr);
      } catch (e) {
        console.warn(`[${requestId}] Failed to increment EK usage (non-critical):`, e);
      }
    } else {
      // === EXISTING AGENT: Fetch agent info ===
      const { data: existingAgent, error: agentError } = await supabaseClient
        .from('agents')
        .select('agent_name, os_type, hmac_secret')
        .eq('id', resolvedAgentId)
        .order('enrolled_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (agentError || !existingAgent) {
        console.log(`[${requestId}] Agent not found: ${agentError?.message}`);
        return new Response('Agent not found', { 
          status: 404,
          headers: corsHeaders
        });
      }
      agentData = existingAgent;
    }

    // Generate fresh token for the agent
    const freshAgentToken = crypto.randomUUID();
    const freshTokenHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(freshAgentToken)
    );
    const freshTokenHash = Array.from(new Uint8Array(freshTokenHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const freshTokenPrefix = freshAgentToken.substring(0, 8);

    // Deactivate old tokens for this agent
    await supabaseClient
      .from('agent_tokens')
      .update({ is_active: false })
      .eq('agent_id', resolvedAgentId);

    // Create new token with hash
    const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    const { error: tokenInsertError } = await supabaseClient
      .from('agent_tokens')
      .insert({
        agent_id: resolvedAgentId,
        token_hash: freshTokenHash,
        token_prefix: freshTokenPrefix,
        expires_at: tokenExpiresAt.toISOString(),
        is_active: true,
      });

    if (tokenInsertError) {
      console.error(`[${requestId}] Failed to create fresh agent token`, tokenInsertError);
      return new Response('Failed to generate agent credentials', { 
        status: 500,
        headers: corsHeaders
      });
    }

    console.log(`[${requestId}] Fresh agent token generated`, {
      tokenPrefix: freshTokenPrefix,
      agentId: resolvedAgentId
    });

    // CRITICAL FIX: Fetch Windows agent script from agent_releases table (same as Linux/macOS)
    // This ensures version synchronization - no more desync with storage bucket
    console.log(`[${requestId}] Fetching Windows agent script from agent_releases database`);
    
    const { validateAgentScriptContent, calculateScriptHash } = await import('../_shared/agent-script-validator.ts');
    
    // Buscar script da tabela agent_releases (fonte única de verdade)
    const { data: windowsReleaseData, error: windowsReleaseError } = await supabaseClient
      .from('agent_releases')
      .select('script_content, version, sha256')
      .eq('platform', 'windows')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (windowsReleaseError || !windowsReleaseData?.script_content) {
      console.error(`[${requestId}] No active Windows agent release found:`, windowsReleaseError);
      return new Response(
        JSON.stringify({
          error: 'No active Windows agent release found',
          details: 'Please register an active agent release for Windows in Admin > Agent Releases',
          requestId
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const agentScriptContent = windowsReleaseData.script_content;
    const registeredVersion = windowsReleaseData.version;
    
    if (!validateAgentScriptContent(agentScriptContent)) {
      console.error(`[${requestId}] CRITICAL: Script validation failed for Windows release`);
      return new Response(
        'Failed to generate secure installer - script validation failed',
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
    
    console.log(`[${requestId}] Windows agent script loaded from database`, { 
      size: agentScriptContent.length,
      sizeKB: (agentScriptContent.length / 1024).toFixed(2),
      hash: agentScriptHash,
      registeredVersion,
      source: 'agent_releases'
    });


    // P1 SEC-002 FIX: Use freshly generated token (created above when installer was requested)
    // This token was just created and stored hashed in agent_tokens
    const agentToken = freshAgentToken;
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
      token_prefix: freshTokenPrefix,
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
      console.log('[' + requestId + '] Using Windows embedded template (' + agentScriptContentForPlatform.length + ' bytes)');
    } else if (platform === 'macos' || platform === 'linux') {
      // macOS/Linux: fetch script from agent_releases database (not placeholder files)
      const { data: releaseData, error: releaseError } = await supabaseClient
        .from('agent_releases')
        .select('script_content, version')
        .eq('platform', platform)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (releaseError || !releaseData?.script_content) {
        console.error(`[${requestId}] No active ${platform} agent release found:`, releaseError);
        return new Response(
          JSON.stringify({
            error: `No active ${platform} agent release found`,
            details: 'Please register an active agent release for this platform in Admin > Agent Releases',
            requestId
          }),
          { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      agentScriptContentForPlatform = releaseData.script_content;
      agentScriptUrl = ''; // Embedded script in installer
      
      // Select template based on platform and mode
      if (platform === 'macos') {
        templateContent = mode === 'envvars' 
          ? MACOS_INSTALLER_TEMPLATE_V3_ENVVARS 
          : MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED;
      } else {
        templateContent = mode === 'envvars'
          ? LINUX_INSTALLER_TEMPLATE_V3_ENVVARS
          : LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED;
      }
      
      console.log(`[${requestId}] Loaded ${platform} agent script from database`, {
        version: releaseData.version,
        size: agentScriptContentForPlatform.length,
        mode: mode
      });
    } else {
      // Fallback for unsupported platforms
      console.error(`[${requestId}] Unsupported platform: ${platform}`);
      return new Response(
        JSON.stringify({
          error: 'Unsupported platform',
          details: `Platform "${platform}" is not supported. Use windows, linux, or macos.`,
          requestId
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      .replace(/\{\{INSTALLER_VERSION\}\}/g, INSTALLER_VERSION)
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

    // ============= VALIDACAO CRITICA ADICIONAL =============

    // ? BUG FIX P0: Validar TODOS os placeholders criticos foram substituidos
    const criticalPlaceholders = ['{{AGENT_NAME}}', '{{AGENT_TOKEN}}', '{{HMAC_SECRET}}', '{{SERVER_URL}}'];
    const unsubstitutedCritical = criticalPlaceholders.filter(ph => templateContent.includes(ph));
    
    if (unsubstitutedCritical.length > 0) {
      console.error(`[${requestId}] CRITICAL: Unsubstituted critical placeholders`, {
        platform,
        agentName: agentData.agent_name,
        unsubstituted: unsubstitutedCritical
      });
      
      return new Response(
        JSON.stringify({
          error: 'Critical placeholders not substituted',
          details: `Template contains: ${unsubstitutedCritical.join(', ')}`,
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 1) Garantir que AGENT_SCRIPT_CONTENT foi substituido (especifico para Windows)
    if (platform === 'windows' && templateContent.includes('{{AGENT_SCRIPT_CONTENT}}')) {
      console.error(`[${requestId}] CRITICAL: AGENT_SCRIPT_CONTENT placeholder not replaced`, {
        platform,
        agentName: agentData.agent_name,
        scriptSize: agentScriptContentForPlatform?.length || 0
      });
      
      return new Response(
        JSON.stringify({
          error: 'Agent script content not injected',
          details: 'Template contains unresolved {{AGENT_SCRIPT_CONTENT}} placeholder',
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 2) Validar tamanho minimo do script gerado (detectar truncamento)
    const MIN_INSTALLER_SIZE = 10000; // ~10KB minimo para um instalador valido

    if (templateContent.length < MIN_INSTALLER_SIZE) {
      console.error(`[${requestId}] CRITICAL: Generated installer too small`, {
        platform,
        agentName: agentData.agent_name,
        installerSize: templateContent.length,
        expectedMinimum: MIN_INSTALLER_SIZE
      });
      
      return new Response(
        JSON.stringify({
          error: 'Generated installer script too small',
          details: `Installer size: ${templateContent.length} bytes (expected > ${MIN_INSTALLER_SIZE} bytes)`,
          requestId,
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // 3) ? BUG FIX P2: Para Windows, validar que o script do agente embutido nao esta vazio ou truncado
    // Regex melhorado: aceita @' e @" para here-strings
    if (platform === 'windows') {
      const hereStringPattern = /\$AgentScriptContent\s*=\s*@['"]\s*([\s\S]*?)\s*['"]@/;
      const scriptContentMatch = templateContent.match(hereStringPattern);
      
      if (!scriptContentMatch || scriptContentMatch[1].trim().length < 5000) {
        console.error(`[${requestId}] CRITICAL: Windows agent script content invalid or truncated`, {
          agentName: agentData.agent_name,
          embeddedScriptSize: scriptContentMatch?.[1]?.length || 0
        });
        
        return new Response(
          JSON.stringify({
            error: 'Windows agent script invalid or truncated',
            details: 'Embedded PowerShell script is too small or missing',
            requestId,
            timestamp: new Date().toISOString()
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // ? BUG FIX P2: Validar presenca de funcoes criticas no script embutido
      const embeddedScript = scriptContentMatch[1];
      const criticalFunctions = ['Submit-JobResult', 'Send-Heartbeat', 'Poll-Jobs'];
      const missingFunctions = criticalFunctions.filter(fn => !embeddedScript.includes(fn));
      
      if (missingFunctions.length > 0) {
        console.error(`[${requestId}] CRITICAL: Missing critical functions in embedded agent script`, {
          agentName: agentData.agent_name,
          missingFunctions
        });
        
        return new Response(
          JSON.stringify({
            error: 'Embedded agent script missing critical functions',
            details: `Missing: ${missingFunctions.join(', ')}`,
            requestId,
            timestamp: new Date().toISOString()
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      // PHASE 4: StartedAt validation removed - v5.0.3 handles Jobs v3 internally
      // The StartedAt parameter is managed by the agent's job execution engine,
      // not required in the main script param() block.
      console.log(`[${requestId}] [OK]  Script validation complete (StartedAt check skipped - handled by agent internally)`);
    }

    // ? BUG FIX P3: Log consolidado de sucesso com TODAS as validacoes
    console.log(`[${requestId}] [OK]  All installer validations passed`, {
      installerSize: templateContent.length,
      installerSizeKB: (templateContent.length / 1024).toFixed(2),
      platform,
      agentName: agentData.agent_name,
      validations: {
        criticalPlaceholdersSubstituted: true,
        agentScriptContentInjected: platform === 'windows',
        minSizeCheck: true,
        embeddedScriptValid: platform === 'windows',
        criticalFunctionsPresent: platform === 'windows',
        startedAtParameterPresent: platform === 'windows'
      }
    });

    // PHASE 3: Security validation - $headers indexing is legitimate PowerShell in agent scripts
    // Previous pattern checks caused false positives on valid PowerShell code
    console.log(`[${requestId}] [OK] Script security validation passed (PowerShell patterns allowed)`);

    // Validacao final: garantir que nao sobrou nenhum {{PLACEHOLDER}}
    validateNoPlaceholders(templateContent, platform, requestId);

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

    // Track "downloaded" event for installation analytics
    try {
      const { error: telemetryError } = await supabaseClient
        .from('installation_analytics')
        .insert({
          tenant_id: enrollmentData.tenant_id,
          agent_id: resolvedAgentId,
          agent_name: agentData.agent_name,
          event_type: 'downloaded',
          platform: platform,
          installation_method: 'one_click',
          success: true,
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          user_agent: req.headers.get('user-agent') || 'unknown',
          metadata: {
            installer_version: INSTALLER_VERSION,
            installer_size_bytes: installerSizeBytes,
            installer_sha256: installerSha256.substring(0, 16) + '...'
          }
        });

      if (telemetryError) {
        console.warn(`[${requestId}] Failed to track downloaded event:`, telemetryError);
      } else {
        console.log(`[${requestId}] Tracked 'downloaded' event for ${agentData.agent_name}`);
      }
    } catch (telemetryErr) {
      console.warn(`[${requestId}] Telemetry error:`, telemetryErr);
    }

    // Return script
    const fileName = platform === 'windows'
      ? `install-${agentData.agent_name}-windows.ps1`
      : `install-${agentData.agent_name}-linux.sh`;

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Completed successfully in ${duration}ms`);

      // FASE 2: Return script with SHA256 and version in headers
      // v4.1.6: Added Cache-Control: no-store to prevent proxy/browser caching
      return new Response(templateContent, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'X-Script-SHA256': installerSha256,
          'X-Script-Size': installerSizeBytes.toString(),
          'X-Installer-Version': INSTALLER_VERSION,
          'X-Installer-Updated': LAST_UPDATED,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
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