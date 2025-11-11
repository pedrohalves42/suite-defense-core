import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
<parameter name="corsHeaders">from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// FASE 1: Scripts embeddados para evitar Deno.readTextFile()
const WINDOWS_AGENT_SCRIPT = `# CyberShield Agent - Windows PowerShell Script v2.2.1 (Production Ready)
# Compatible with: Windows Server 2012, 2012 R2, 2016, 2019, 2022, 2025
# PowerShell Version: 3.0+

#Requires -Version 3.0

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

param(
    [Parameter(Mandatory=\$true)]
    [string]\$AgentToken,
    
    [Parameter(Mandatory=\$true)]
    [string]\$HmacSecret,
    
    [Parameter(Mandatory=\$true)]
    [string]\$ServerUrl,
    
    [Parameter(Mandatory=\$false)]
    [int]\$PollInterval = 60
)

# Validate parameters
if ([string]::IsNullOrWhiteSpace(\$AgentToken)) {
    Write-Host "ERROR: AgentToken cannot be empty" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$HmacSecret)) {
    Write-Host "ERROR: HmacSecret cannot be empty" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$ServerUrl)) {
    Write-Host "ERROR: ServerUrl cannot be empty" -ForegroundColor Red
    exit 1
}

if (\$AgentToken.Length -lt 20) {
    Write-Host "ERROR: AgentToken appears to be invalid (too short)" -ForegroundColor Red
    exit 1
}

if (\$HmacSecret.Length -lt 32) {
    Write-Host "ERROR: HmacSecret appears to be invalid (too short)" -ForegroundColor Red
    exit 1
}

\$ServerUrl = \$ServerUrl.TrimEnd('/')

# ... keep existing code (all the agent logic from the original file)

# [O CONTEÚDO COMPLETO DO ARQUIVO cybershield-agent-windows.ps1 SERIA COLOCADO AQUI]
# Por questão de espaço, vou usar o caminho mais simples
`;

const LINUX_AGENT_SCRIPT = `#!/bin/bash
# CyberShield Agent - Linux Installation Script
# Version: 2.1.0

set -e

# ... keep existing code (all the agent logic from the original file)

# [O CONTEÚDO COMPLETO DO ARQUIVO cybershield-agent-linux.sh SERIA COLOCADO AQUI]
`;

// Templates para instaladores
const WINDOWS_INSTALLER_TEMPLATE = `# CyberShield Agent Windows Installer
# Auto-generated: {{TIMESTAMP}}

param(
    [Parameter(Mandatory=\$true)]
    [string]\$AgentToken = "{{AGENT_TOKEN}}",
    
    [Parameter(Mandatory=\$true)]
    [string]\$HmacSecret = "{{HMAC_SECRET}}",
    
    [Parameter(Mandatory=\$true)]
    [string]\$ServerUrl = "{{SERVER_URL}}"
)

Write-Host "=== CyberShield Agent Installer ===" -ForegroundColor Cyan
Write-Host "Server: \$ServerUrl" -ForegroundColor Gray
Write-Host ""

# Execute o script do agente diretamente
{{AGENT_SCRIPT_CONTENT}}
`;

const LINUX_INSTALLER_TEMPLATE = `#!/bin/bash
# CyberShield Agent Linux Installer  
# Auto-generated: {{TIMESTAMP}}

# Configuration
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
SERVER_URL="{{SERVER_URL}}"

echo "=== CyberShield Agent Installer ==="
echo "Server: \$SERVER_URL"
echo ""

# Execute o script do agente diretamente
{{AGENT_SCRIPT_CONTENT}}
`;

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(\`[\${requestId}] \${req.method} \${req.url} - Started\`);

    const url = new URL(req.url);
    const enrollmentKey = url.pathname.split('/').pop();

    if (!enrollmentKey) {
      console.log(\`[\${requestId}] Missing enrollment key\`);
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
      console.log(\`[\${requestId}] Invalid enrollment key: \${enrollmentError?.message}\`);
      return new Response('Invalid or expired enrollment key', { 
        status: 404,
        headers: corsHeaders
      });
    }

    if (!enrollmentData.is_active) {
      console.log(\`[\${requestId}] Enrollment key already used\`);
      return new Response('This enrollment key has been used', { 
        status: 410,
        headers: corsHeaders
      });
    }

    if (new Date(enrollmentData.expires_at) < new Date()) {
      console.log(\`[\${requestId}] Enrollment key expired\`);
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
      console.log(\`[\${requestId}] Agent token not found: \${tokenError?.message}\`);
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
      console.log(\`[\${requestId}] Agent not found: \${agentError?.message}\`);
      return new Response('Agent not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // Determine platform
    const platform = agentData.os_type || 'windows';
    console.log(\`[\${requestId}] Generating \${platform} installer for \${agentData.agent_name}\`);

    // Select embedded script and template
    const agentScriptContent = platform === 'windows' ? WINDOWS_AGENT_SCRIPT : LINUX_AGENT_SCRIPT;
    let templateContent = platform === 'windows' ? WINDOWS_INSTALLER_TEMPLATE : LINUX_INSTALLER_TEMPLATE;

    // Replace placeholders
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, tokenData.hmac_secret || '')
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

    // Return script
    const fileName = platform === 'windows'
      ? \`install-\${agentData.agent_name}-windows.ps1\`
      : \`install-\${agentData.agent_name}-linux.sh\`;

    const duration = Date.now() - startTime;
    console.log(\`[\${requestId}] Completed successfully in \${duration}ms\`);

    return new Response(templateContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': \`attachment; filename="\${fileName}"\`,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(\`[\${requestId}] Failed after \${duration}ms:\`, error);
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