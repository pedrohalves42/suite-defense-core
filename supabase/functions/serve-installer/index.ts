import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Embedded templates to avoid path issues
const WINDOWS_TEMPLATE = `# CyberShield Agent Windows Installer
# Auto-generated: {{TIMESTAMP}}

# Configuration
$AGENT_TOKEN = "{{AGENT_TOKEN}}"
$HMAC_SECRET = "{{HMAC_SECRET}}"
$SERVER_URL = "{{SERVER_URL}}"
$INSTALL_PATH = "C:\\CyberShield"

# Create installation directory
New-Item -ItemType Directory -Force -Path $INSTALL_PATH | Out-Null
New-Item -ItemType Directory -Force -Path "$INSTALL_PATH\\logs" | Out-Null

# Save agent script
$agentScript = @"
{{AGENT_SCRIPT_CONTENT}}
"@

$agentScript | Out-File -FilePath "$INSTALL_PATH\\agent.ps1" -Encoding UTF8

# Create scheduled task
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File \\"$INSTALL_PATH\\agent.ps1\\""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName "CyberShield-Agent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force

Write-Host "✓ CyberShield Agent instalado com sucesso!" -ForegroundColor Green
Write-Host "  Token: $AGENT_TOKEN"
Write-Host "  Server: $SERVER_URL"
Write-Host "  Path: $INSTALL_PATH"
`;

const LINUX_TEMPLATE = `#!/bin/bash
# CyberShield Agent Linux Installer
# Auto-generated: {{TIMESTAMP}}

set -e

# Configuration
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
SERVER_URL="{{SERVER_URL}}"
INSTALL_PATH="/opt/cybershield"

# Check root
if [ "$EUID" -ne 0 ]; then 
  echo "Por favor execute como root (sudo)"
  exit 1
fi

# Create installation directory
mkdir -p "$INSTALL_PATH/logs"

# Save agent script
cat > "$INSTALL_PATH/agent.sh" <<'AGENT_SCRIPT'
{{AGENT_SCRIPT_CONTENT}}
AGENT_SCRIPT

chmod +x "$INSTALL_PATH/agent.sh"

# Create systemd service
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Agent
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_PATH/agent.sh
Restart=always
RestartSec=60
StandardOutput=append:$INSTALL_PATH/logs/agent.log
StandardError=append:$INSTALL_PATH/logs/agent.log
Environment="AGENT_TOKEN=$AGENT_TOKEN"
Environment="HMAC_SECRET=$HMAC_SECRET"
Environment="SERVER_URL=$SERVER_URL"

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

echo "✓ CyberShield Agent instalado com sucesso!"
echo "  Token: $AGENT_TOKEN"
echo "  Server: $SERVER_URL"
echo "  Path: $INSTALL_PATH"
echo "  Status: systemctl status cybershield-agent"
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
      return new Response('Enrollment key is required', { 
        status: 400,
        headers: corsHeaders
      });
    }

    const supabaseClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch credentials
    const { data: enrollmentData, error: enrollmentError } = await supabaseClient
      .from('enrollment_keys')
      .select('agent_id, is_active, expires_at')
      .eq('key', enrollmentKey)
      .single();

    if (enrollmentError || !enrollmentData) {
      console.log(`[${requestId}] Invalid enrollment key`);
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

    // Fetch token
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('agent_tokens')
      .select('token, hmac_secret')
      .eq('agent_id', enrollmentData.agent_id)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      console.log(`[${requestId}] Agent token not found`);
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
      console.log(`[${requestId}] Agent not found`);
      return new Response('Agent not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // Determine platform
    const platform = agentData.os_type || 'windows';
    console.log(`[${requestId}] Generating ${platform} installer for ${agentData.agent_name}`);

    // Load agent script from public directory
    const agentScriptPath = platform === 'windows' 
      ? './public/agent-scripts/cybershield-agent-windows.ps1'
      : './public/agent-scripts/cybershield-agent-linux.sh';
    
    let agentScriptContent: string;
    try {
      agentScriptContent = await Deno.readTextFile(agentScriptPath);
    } catch (e) {
      console.error(`[${requestId}] Failed to read agent script:`, e);
      return new Response('Failed to load agent script', { 
        status: 500,
        headers: corsHeaders
      });
    }

    // Select template
    let templateContent = platform === 'windows' ? WINDOWS_TEMPLATE : LINUX_TEMPLATE;

    // Replace placeholders
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, tokenData.hmac_secret)
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
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
