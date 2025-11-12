import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Windows Installer v3.0 - Requires Admin + Scheduled Task
const WINDOWS_INSTALLER_TEMPLATE = `# CyberShield Agent Windows Installer v3.0
# Auto-generated: {{TIMESTAMP}}

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$AGENT_TOKEN = "{{AGENT_TOKEN}}"
$HMAC_SECRET = "{{HMAC_SECRET}}"
$SERVER_URL = "{{SERVER_URL}}"

Write-Host "=== CyberShield Agent Installer v3.0 ===" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar permissões de administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "✗ ERRO: Este instalador requer privilégios de Administrador" -ForegroundColor Red
    Write-Host ""
    Write-Host "Clique com botão direito no arquivo e selecione 'Executar como Administrador'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host "✓ Executando com privilégios de Administrador" -ForegroundColor Green

# 2. Criar diretórios
$InstallDir = "C:\\CyberShield"
$LogDir = "C:\\CyberShield\\logs"

Write-Host "Criando diretórios..." -ForegroundColor Gray
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
Write-Host "✓ Diretórios criados" -ForegroundColor Green

# 3. Baixar script do agente
$agentUrl = "{{SERVER_URL}}/agent-scripts/cybershield-agent-windows.ps1"
$agentPath = "$InstallDir\\cybershield-agent.ps1"
$expectedHash = "{{AGENT_HASH}}"

Write-Host "Baixando agente de $agentUrl..." -ForegroundColor Gray
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $agentUrl -OutFile $agentPath -UseBasicParsing -ErrorAction Stop
    
    # Validar hash SHA256
    Write-Host "Validando integridade do arquivo..." -ForegroundColor Gray
    $actualHash = (Get-FileHash -Path $agentPath -Algorithm SHA256).Hash.ToLower()
    
    if ($actualHash -ne $expectedHash) {
        Write-Host "✗ ERRO CRÍTICO: Hash SHA256 não corresponde!" -ForegroundColor Red
        Write-Host "  Esperado: $expectedHash" -ForegroundColor Yellow
        Write-Host "  Obtido:   $actualHash" -ForegroundColor Yellow
        Write-Host "  POSSÍVEL ATAQUE OU DOWNLOAD CORROMPIDO!" -ForegroundColor Red
        Remove-Item $agentPath -Force
        Read-Host "Pressione Enter para sair"
        exit 1
    }
    
    Write-Host "✓ Agente baixado e validado (hash OK)" -ForegroundColor Green
} catch {
    Write-Host "✗ Falha no download: $_" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# 4. Criar Scheduled Task (roda na inicialização)
$taskName = "CyberShield-Agent"
$taskDescription = "CyberShield Security Agent - Monitors system security"

Write-Host "Configurando Scheduled Task..." -ForegroundColor Gray

# Remover task existente se houver
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "  Removendo tarefa existente..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Criar action (executar PowerShell com o agente)
$action = New-ScheduledTaskAction \`
    -Execute "PowerShell.exe" \`
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$agentPath\`" -AgentToken \`"$AGENT_TOKEN\`" -HmacSecret \`"$HMAC_SECRET\`" -ServerUrl \`"$SERVER_URL\`""

# Criar trigger (na inicialização do sistema)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Configurações da task
$settings = New-ScheduledTaskSettingsSet \`
    -AllowStartIfOnBatteries \`
    -DontStopIfGoingOnBatteries \`
    -StartWhenAvailable \`
    -RunOnlyIfNetworkAvailable \`
    -DontStopOnIdleEnd

# Criar principal (rodar como SYSTEM com privilégios mais altos)
$principal = New-ScheduledTaskPrincipal \`
    -UserId "SYSTEM" \`
    -LogonType ServiceAccount \`
    -RunLevel Highest

# Registrar task
try {
    Register-ScheduledTask \`
        -TaskName $taskName \`
        -Description $taskDescription \`
        -Action $action \`
        -Trigger $trigger \`
        -Settings $settings \`
        -Principal $principal \`
        -Force | Out-Null
    
    Write-Host "✓ Scheduled Task criada: $taskName" -ForegroundColor Green
} catch {
    Write-Host "✗ Erro ao criar Scheduled Task: $_" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# 5. Iniciar task imediatamente
Write-Host "Iniciando agente..." -ForegroundColor Gray
try {
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 2
    
    $task = Get-ScheduledTask -TaskName $taskName
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
    
    if ($task.State -eq "Running") {
        Write-Host "✓ Agente iniciado com sucesso!" -ForegroundColor Green
    } elseif ($task.State -eq "Ready" -and $taskInfo.LastTaskResult -eq 0) {
        Write-Host "✓ Agente executado com sucesso e está rodando em background" -ForegroundColor Green
    } else {
        Write-Host "⚠ Agente configurado, mas status: $($task.State)" -ForegroundColor Yellow
        Write-Host "  Last Result: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
        Write-Host "  O agente será iniciado automaticamente na próxima reinicialização" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠ Agente configurado, mas falhou ao iniciar agora: $_" -ForegroundColor Yellow
    Write-Host "  Será iniciado automaticamente na próxima reinicialização" -ForegroundColor Gray
}

# 6. Resumo da instalação
Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Instalação Concluída!" -ForegroundColor Green
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Detalhes:" -ForegroundColor White
Write-Host "  • Agente: $agentPath" -ForegroundColor Gray
Write-Host "  • Logs: $LogDir" -ForegroundColor Gray
Write-Host "  • Task: $taskName" -ForegroundColor Gray
Write-Host "  • Servidor: {{SERVER_URL}}" -ForegroundColor Gray
Write-Host ""
Write-Host "Comandos úteis:" -ForegroundColor White
Write-Host "  Ver status:     Get-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host "  Ver logs:       Get-Content '$LogDir\\agent.log' -Tail 50" -ForegroundColor Gray
Write-Host "  Parar agente:   Stop-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host "  Iniciar agente: Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host "  Remover agente: Unregister-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
Write-Host ""
Write-Host "O agente está rodando em background e iniciará automaticamente com o Windows." -ForegroundColor Green
Write-Host ""
Read-Host "Pressione Enter para fechar"
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

    // Calculate SHA256 hash of agent script for integrity validation
    const agentScriptUrl = `${SUPABASE_URL}/agent-scripts/cybershield-agent-windows.ps1`;
    console.log(`[${requestId}] Fetching agent script to calculate hash: ${agentScriptUrl}`);
    
    let agentScriptHash = '';
    try {
      const agentScriptResponse = await fetch(agentScriptUrl);
      if (!agentScriptResponse.ok) {
        throw new Error(`Failed to fetch agent script: ${agentScriptResponse.status}`);
      }
      
      const agentScriptContent = await agentScriptResponse.text();
      
      // Generate SHA256 hash
      const encoder = new TextEncoder();
      const data = encoder.encode(agentScriptContent);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      agentScriptHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log(`[${requestId}] Agent script hash calculated: ${agentScriptHash}`);
    } catch (hashError) {
      console.error(`[${requestId}] Failed to calculate agent script hash:`, hashError);
      return new Response('Failed to generate secure installer', { 
        status: 500,
        headers: corsHeaders
      });
    }

    // Validate credentials are present
    if (!tokenData.token || !agentData.hmac_secret) {
      console.error(`[${requestId}] Missing credentials: token=${!!tokenData.token}, hmac=${!!agentData.hmac_secret}`);
      return new Response('Agent credentials incomplete', { 
        status: 500,
        headers: corsHeaders
      });
    }

    // Determine platform
    const platform = agentData.os_type || 'windows';
    console.log(`[${requestId}] Generating ${platform} installer for ${agentData.agent_name}`);

    // Select template
    let templateContent = platform === 'windows' ? WINDOWS_INSTALLER_TEMPLATE : LINUX_INSTALLER_TEMPLATE;

    // FASE 1 CORREÇÃO: Replace placeholders with validated credentials
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, agentData.hmac_secret) // Fixed: from agents table
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_HASH\}\}/g, agentScriptHash) // NEW: Hash for integrity validation
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

    // Final validation: ensure no placeholders remain
    if (templateContent.includes('{{')) {
      console.error(`[${requestId}] Template still contains placeholders after replacement`);
      return new Response('Installer generation failed: incomplete template', { 
        status: 500,
        headers: corsHeaders
      });
    }

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