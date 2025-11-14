import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { WINDOWS_INSTALLER_TEMPLATE } from '../_shared/installer-template.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Linux installer template (kept for backwards compatibility)
const LINUX_INSTALLER_TEMPLATE = `#!/bin/bash
# CyberShield Agent - Linux Installation Script
# Auto-generated: {{TIMESTAMP}}

set -e

AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
SERVER_URL="{{SERVER_URL}}"
INSTALL_DIR="/opt/cybershield"

echo "=========================================="
echo "CyberShield Agent Installer"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "ERROR: This script must be run as root"
  echo "Please run: sudo bash install.sh"
  exit 1
fi

echo "Creating installation directory..."
mkdir -p "$INSTALL_DIR/logs"

echo "Downloading agent script..."
curl -sSL "$SERVER_URL/agent-scripts/cybershield-agent-linux.sh" -o "$INSTALL_DIR/cybershield-agent.sh"
chmod +x "$INSTALL_DIR/cybershield-agent.sh"

echo "Creating systemd service..."
cat > /etc/systemd/system/cybershield-agent.service << EOF
[Unit]
Description=CyberShield Security Agent
After=network.target

[Service]
Type=simple
ExecStart=/bin/bash $INSTALL_DIR/cybershield-agent.sh
Restart=always
RestartSec=10
Environment="AGENT_TOKEN=$AGENT_TOKEN"
Environment="HMAC_SECRET=$HMAC_SECRET"
Environment="SERVER_URL=$SERVER_URL"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cybershield-agent
systemctl start cybershield-agent

echo ""
echo "=========================================="
echo "✓ Installation completed successfully!"
echo "=========================================="
echo ""
echo "Agent status: \$(systemctl is-active cybershield-agent)"
echo "View logs: journalctl -u cybershield-agent -f"
echo ""
`;

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

    // Select template (using shared template)
    let templateContent = platform === 'windows' ? WINDOWS_INSTALLER_TEMPLATE : LINUX_INSTALLER_TEMPLATE;

    // FASE 2: Replace placeholders with validated credentials
    // Using function callbacks to prevent $ character interpretation
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, () => agentToken)
      .replace(/\{\{HMAC_SECRET\}\}/g, () => hmacSecret)
      .replace(/\{\{SERVER_URL\}\}/g, () => SUPABASE_URL)
      .replace(/\{\{POLL_INTERVAL\}\}/g, '60')
      .replace(/\{\{AGENT_HASH\}\}/g, () => agentScriptHash)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, () => agentScriptContent)
      .replace(/\{\{AGENT_NAME\}\}/g, () => agentData.agent_name)
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