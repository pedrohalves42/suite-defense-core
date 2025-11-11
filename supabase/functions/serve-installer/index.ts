import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// FASE 1 CORREÇÃO: Templates simplificados - instalador baixa scripts do servidor
const WINDOWS_INSTALLER_TEMPLATE = `# CyberShield Agent Windows Installer
# Auto-generated: {{TIMESTAMP}}

$AGENT_TOKEN = "{{AGENT_TOKEN}}"
$HMAC_SECRET = "{{HMAC_SECRET}}"
$SERVER_URL = "{{SERVER_URL}}"

Write-Host "=== CyberShield Agent Installer ===" -ForegroundColor Cyan

# Executar agent diretamente com parâmetros
# O script do agente já está disponível publicamente
$agentUrl = "{{SERVER_URL}}/agent-scripts/cybershield-agent-windows.ps1"
$agentPath = "$env:TEMP\\cybershield-agent.ps1"

Write-Host "Downloading agent..." -ForegroundColor Gray
try {
    Invoke-WebRequest -Uri $agentUrl -OutFile $agentPath -UseBasicParsing -ErrorAction Stop
    Write-Host "✓ Agent downloaded" -ForegroundColor Green
} catch {
    Write-Host "✗ Download failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Starting agent..." -ForegroundColor Gray
& PowerShell.exe -ExecutionPolicy Bypass -File $agentPath -AgentToken $AGENT_TOKEN -HmacSecret $HMAC_SECRET -ServerUrl $SERVER_URL
`;

const LINUX_INSTALLER_TEMPLATE = `#!/bin/bash
# CyberShield Agent Linux Installer  
# Auto-generated: {{TIMESTAMP}}

AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
SERVER_URL="{{SERVER_URL}}"

echo "=== CyberShield Agent Installer ==="

# Executar agent diretamente com parâmetros
AGENT_URL="{{SERVER_URL}}/agent-scripts/cybershield-agent-linux.sh"
AGENT_PATH="/tmp/cybershield-agent.sh"

echo "Downloading agent..."
if curl -sSL "$AGENT_URL" -o "$AGENT_PATH" 2>/dev/null; then
    echo "✓ Agent downloaded"
    chmod +x "$AGENT_PATH"
    echo "Starting agent..."
    bash "$AGENT_PATH" "$AGENT_TOKEN" "$HMAC_SECRET" "$SERVER_URL"
else
    echo "✗ Download failed"
    exit 1
fi
`;

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] ${req.method} ${req.url} - Started`);

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
      .single();

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

    // Fetch agent token
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('agent_tokens')
      .select('token, hmac_secret')
      .eq('agent_id', enrollmentData.agent_id)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      console.log(`[${requestId}] Agent token not found: ${tokenError?.message}`);
      return new Response('Agent token not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // Fetch agent info
    const { data: agentData, error: agentError } = await supabaseClient
      .from('agents')
      .select('agent_name, os_type')
      .eq('id', enrollmentData.agent_id)
      .single();

    if (agentError || !agentData) {
      console.log(`[${requestId}] Agent not found: ${agentError?.message}`);
      return new Response('Agent not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // Determine platform
    const platform = agentData.os_type || 'windows';
    console.log(`[${requestId}] Generating ${platform} installer for ${agentData.agent_name}`);

    // Select template
    let templateContent = platform === 'windows' ? WINDOWS_INSTALLER_TEMPLATE : LINUX_INSTALLER_TEMPLATE;

    // Replace placeholders
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, tokenData.hmac_secret || '')
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

    // Return script
    const fileName = platform === 'windows'
      ? `install-${agentData.agent_name}-windows.ps1`
      : `install-${agentData.agent_name}-linux.sh`;

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Completed successfully in ${duration}ms`);

    return new Response(templateContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error) {
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